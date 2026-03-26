require("dotenv").config();

const express = require("express");
const Groq = require("groq-sdk");
const { db, getSchema } = require("../db");

const router = express.Router();

const MODEL = "llama-3.3-70b-versatile";
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const client = new Groq({ apiKey: GROQ_API_KEY });

function cleanJsonText(text) {
  if (!text) return "";
  return text.replace(/```/g, "").trim();
}

function cleanSql(raw) {
  if (!raw) return "";
  return raw
    .replace(/```sql/gi, "")
    .replace(/```/g, "")
    .replace(/^sql\s*[:\-]?\s*/i, "")
    .trim();
}

router.post("/", async (req, res) => {
  try {
    const { message } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ answer: "Please provide a valid message." });
    }

    if (!GROQ_API_KEY) {
      throw new Error("Missing GROQ_API_KEY");
    }

    const schema = getSchema();

    const systemPrompt =
      "You are an AI assistant for a SAP Order-to-Cash (O2C) business database. \n\nSTRICT RULES:\n- Only answer questions about this business data. If the question is unrelated to sales orders, deliveries, billing, payments, customers or products, respond with JSON: {\"type\": \"off_topic\"}\n- Always respond with valid JSON in one of these formats:\n  {\"type\": \"sql\", \"query\": \"SELECT ...\"}\n  {\"type\": \"off_topic\"}\n\nDATABASE SCHEMA AND RELATIONSHIPS:\nTables:\n- sales_order_headers: salesOrder, soldToParty, totalNetAmount, overallDeliveryStatus, overallOrdReltdBillgStatus, creationDate, transactionCurrency\n- sales_order_items: salesOrder, salesOrderItem, material, netAmount, requestedQuantity\n- outbound_delivery_headers: deliveryDocument, shippingPoint, overallGoodsMovementStatus, creationDate\n- outbound_delivery_items: deliveryDocument, referenceSdDocument, plant, actualDeliveryQuantity\n- billing_document_headers: billingDocument, soldToParty, totalNetAmount, billingDocumentDate, accountingDocument, billingDocumentIsCancelled\n- billing_document_items: billingDocument, billingDocumentItem, referenceSdDocument, material, netAmount\n- payments_accounts_receivable: accountingDocument, customer, invoiceReference, amountInTransactionCurrency, postingDate\n- business_partners: businessPartner, customer, businessPartnerFullName, businessPartnerName\n- products: product, productType, division\n- product_descriptions: product, language, productDescription\n- journal_entry_items_accounts_receivable: accountingDocument, companyCode, customer, amountInTransactionCurrency\n\nCRITICAL JOIN PATHS (always use these exact joins):\n- Sales Order → Delivery: outbound_delivery_items.referenceSdDocument = sales_order_headers.salesOrder\n- Delivery → Billing: billing_document_items.referenceSdDocument = outbound_delivery_headers.deliveryDocument  \n- Billing → Payment: payments_accounts_receivable.invoiceReference = billing_document_headers.billingDocument\n- Billing → Journal: billing_document_headers.accountingDocument = journal_entry_items_accounts_receivable.accountingDocument\n- Customer → Sales Order: sales_order_headers.soldToParty = business_partners.customer\n- Product → Billing: billing_document_items.material = products.product\n- Product name: JOIN product_descriptions pd ON pd.product = products.product AND pd.language = 'EN'\n\nEXAMPLE QUERIES:\nQ: Which products have most billing documents?\nA: {\"type\":\"sql\",\"query\":\"SELECT pd.productDescription, COUNT(DISTINCT bdi.billingDocument) as billingCount FROM billing_document_items bdi JOIN product_descriptions pd ON bdi.material = pd.product AND pd.language = 'EN' GROUP BY bdi.material ORDER BY billingCount DESC LIMIT 10\"}\n\nQ: Trace full flow of a billing document\nA: {\"type\":\"sql\",\"query\":\"SELECT DISTINCT bdh.billingDocument, soh.salesOrder, odh.deliveryDocument, bdh.accountingDocument as journalEntry, jeiar.companyCode, bdh.totalNetAmount FROM billing_document_headers bdh LEFT JOIN journal_entry_items_accounts_receivable jeiar ON jeiar.accountingDocument = bdh.accountingDocument LEFT JOIN billing_document_items bdi ON bdi.billingDocument = bdh.billingDocument LEFT JOIN outbound_delivery_headers odh ON odh.deliveryDocument = bdi.referenceSdDocument LEFT JOIN outbound_delivery_items odi ON odi.deliveryDocument = odh.deliveryDocument LEFT JOIN sales_order_headers soh ON soh.salesOrder = odi.referenceSdDocument ORDER BY bdh.billingDocument DESC LIMIT 10\"}\n\nQ: Find sales orders delivered but not billed\nA: {\"type\":\"sql\",\"query\":\"SELECT DISTINCT soh.salesOrder, odh.deliveryDocument, soh.totalNetAmount FROM sales_order_headers soh JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder JOIN outbound_delivery_headers odh ON odh.deliveryDocument = odi.deliveryDocument LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = odh.deliveryDocument WHERE bdi.billingDocument IS NULL LIMIT 20\"}\n\nQ: Find orders billed without delivery\nA: {\"type\":\"sql\",\"query\":\"SELECT DISTINCT bdh.billingDocument, bdh.soldToParty, bdh.totalNetAmount FROM billing_document_headers bdh LEFT JOIN billing_document_items bdi ON bdi.billingDocument = bdh.billingDocument LEFT JOIN outbound_delivery_headers odh ON odh.deliveryDocument = bdi.referenceSdDocument WHERE odh.deliveryDocument IS NULL LIMIT 20\"}\n\nOnly return the JSON. No explanation. No markdown. No backticks.\n";

    const initialResponse = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Question: ${message}\n\nDatabase schema from getSchema():\n${JSON.stringify(schema)}`,
        },
      ],
    });

    const rawContent =
      initialResponse?.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(cleanJsonText(rawContent));

    if (parsed?.type === "off_topic") {
      return res.json({
        answer:
          "This system only answers questions about the business dataset (sales orders, deliveries, billing, payments, customers and products).",
      });
    }

    if (parsed?.type !== "sql" || typeof parsed?.query !== "string") {
      throw new Error("Invalid model response format");
    }

    const originalSql = cleanSql(parsed.query);
    if (!/^SELECT\b/i.test(originalSql)) {
      throw new Error("Model returned non-SELECT SQL");
    }

    let results;
    try {
      results = db.prepare(originalSql).all();
    } catch (sqlError) {
      const fixedSqlResponse = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "Return ONLY the corrected raw SQL query. No explanation. No markdown. No backticks.",
          },
          {
            role: "user",
            content: `This SQL failed: ${sqlError}. Original SQL: ${originalSql}. Fix it and return only the corrected SQL query, no explanation.`,
          },
        ],
      });

      const fixedSql = cleanSql(
        fixedSqlResponse?.choices?.[0]?.message?.content || ""
      );
      if (!/^SELECT\b/i.test(fixedSql)) {
        throw new Error("Fixed SQL is not a SELECT query");
      }

      results = db.prepare(fixedSql).all();
    }

    if (!Array.isArray(results) || results.length === 0) {
      const broadenResponse = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content:
              "Return ONLY a corrected SQLite SELECT query. No explanation. No markdown. No backticks.",
          },
          {
            role: "user",
            content: `This SQL returned 0 rows. Question: ${message}\nOriginal SQL: ${originalSql}\nRewrite the SQL to return relevant rows for the question (use LIMIT 10-50). Return only the SQL.`,
          },
        ],
      });

      const broadenSql = cleanSql(
        broadenResponse?.choices?.[0]?.message?.content || ""
      );
      if (!/^SELECT\b/i.test(broadenSql)) {
        throw new Error("Broadened SQL is not a SELECT query");
      }

      results = db.prepare(broadenSql).all();
      if (!Array.isArray(results) || results.length === 0) {
        return res.json({
          answer:
            "I couldn’t find any rows for that query. If you’re tracing a billing document flow, please provide a specific billingDocument ID (e.g., “Trace flow for billing document 9000001234”).",
        });
      }
    }

    const finalResponse = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a helpful business analyst. Answer questions based on data provided. Be specific with numbers.",
        },
        {
          role: "user",
          content: `Question: ${message}\nData from database: ${JSON.stringify(
            results
          )}\nGive a clear, concise answer using the actual data.`,
        },
      ],
    });

    const answer = (finalResponse?.choices?.[0]?.message?.content || "").trim();
    return res.json({ answer });
  } catch (error) {
    console.error("Chat route error:", error);
    return res.json({ answer: "Sorry, could not process that query." });
  }
});

module.exports = router;
