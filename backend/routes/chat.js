require("dotenv").config();

const express = require("express");
const Groq = require("groq-sdk");
const { db, getSchema } = require("../db");

const router = express.Router();
const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODEL = "llama-3.3-70b-versatile";

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

    if (!process.env.GROQ_API_KEY) {
      throw new Error("Missing GROQ_API_KEY");
    }

    const schema = getSchema();
    if (!Array.isArray(schema)) {
      throw new Error("Invalid schema");
    }

    const relevanceResponse = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content:
            'You classify questions. Reply with only "YES" or "NO".',
        },
        {
          role: "user",
          content: [
            "Is this question related to business data about sales orders, deliveries, billing documents, payments, customers, or products?",
            `Question: ${message}`,
          ].join("\n"),
        },
      ],
    });

    const relevanceText = (relevanceResponse.choices[0].message.content || "")
      .trim()
      .toUpperCase();

    if (!relevanceText.startsWith("YES")) {
      return res.json({
        answer:
          "This system only answers questions about the business dataset (sales orders, deliveries, billing, payments, customers and products).",
      });
    }

    const sqlResponse = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: `You are a SQLite expert. Here is the exact schema and relationships:

TABLES:
- sales_order_headers: salesOrder, soldToParty, totalNetAmount, overallDeliveryStatus, overallOrdReltdBillgStatus, creationDate, transactionCurrency
- sales_order_items: salesOrder, salesOrderItem, material, netAmount, requestedQuantity
- outbound_delivery_headers: deliveryDocument, shippingPoint, overallGoodsMovementStatus, creationDate
- outbound_delivery_items: deliveryDocument, referenceSdDocument, plant, actualDeliveryQuantity
- billing_document_headers: billingDocument, soldToParty, totalNetAmount, billingDocumentDate, accountingDocument, billingDocumentIsCancelled
- billing_document_items: billingDocument, billingDocumentItem, referenceSdDocument, material, netAmount
- payments_accounts_receivable: accountingDocument, customer, invoiceReference, amountInTransactionCurrency, postingDate, salesDocument
- business_partners: businessPartner, customer, businessPartnerFullName, businessPartnerName
- products: product, productType, division
- product_descriptions: product, language, productDescription
- journal_entry_items_accounts_receivable: accountingDocument, companyCode, customer, amountInTransactionCurrency, postingDate

CRITICAL RELATIONSHIPS (use these exact joins):
- Sales Order to Delivery: outbound_delivery_items.referenceSdDocument = sales_order_headers.salesOrder
- Delivery to Billing: billing_document_items.referenceSdDocument = outbound_delivery_headers.deliveryDocument
- Billing to Payment: payments_accounts_receivable.invoiceReference = billing_document_headers.billingDocument
- Billing to Journal: billing_document_headers.accountingDocument = journal_entry_items_accounts_receivable.accountingDocument
- Customer to Sales Order: sales_order_headers.soldToParty = business_partners.customer
- Product to Sales Order: sales_order_items.material = products.product
- Product descriptions: product_descriptions.product = products.product AND product_descriptions.language = 'EN'

EXAMPLE QUERIES:
-- Products with most billing docs:
SELECT pd.productDescription, COUNT(DISTINCT bdi.billingDocument) as billingCount
FROM billing_document_items bdi
JOIN product_descriptions pd ON bdi.material = pd.product AND pd.language = 'EN'
GROUP BY bdi.material ORDER BY billingCount DESC LIMIT 10

-- Full flow trace for a sales order:
SELECT soh.salesOrder, odh.deliveryDocument, bdh.billingDocument, par.accountingDocument as payment
FROM sales_order_headers soh
LEFT JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder
LEFT JOIN outbound_delivery_headers odh ON odh.deliveryDocument = odi.deliveryDocument
LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = odh.deliveryDocument
LEFT JOIN billing_document_headers bdh ON bdh.billingDocument = bdi.billingDocument
LEFT JOIN payments_accounts_receivable par ON par.invoiceReference = bdh.billingDocument
LIMIT 10

-- Delivered but not billed:
SELECT DISTINCT soh.salesOrder, odh.deliveryDocument
FROM sales_order_headers soh
JOIN outbound_delivery_items odi ON odi.referenceSdDocument = soh.salesOrder
JOIN outbound_delivery_headers odh ON odh.deliveryDocument = odi.deliveryDocument
LEFT JOIN billing_document_items bdi ON bdi.referenceSdDocument = odh.deliveryDocument
WHERE bdi.billingDocument IS NULL

RULES:
- Only SELECT queries
- No markdown, no backticks, no explanation, just raw SQL
- Use GROUP BY + ORDER BY DESC + LIMIT 10 for rankings
- Use LEFT JOIN to find missing relationships

Write ONE SQLite SELECT query to answer: ${message}`,
        },
      ],
    });

    const sql = cleanSql(sqlResponse.choices[0].message.content || "");
    if (!/^SELECT\b/i.test(sql)) {
      throw new Error("Model did not return a valid SELECT query");
    }

    let results;
    try {
      results = db.prepare(sql).all();
    } catch (queryError) {
      if (queryError?.name !== "SqliteError") {
        throw queryError;
      }

      const fixResponse = await client.chat.completions.create({
        model: MODEL,
        messages: [
          {
            role: "system",
            content: [
              `This SQL query failed with error: ${queryError.message}`,
              `The bad SQL was: ${sql}`,
              "",
              "Here is the schema again:",
              "- billing_document_headers columns: billingDocument, billingDocumentType, creationDate, soldToParty, totalNetAmount, accountingDocument",
              "- billing_document_items columns: billingDocument, billingDocumentItem, referenceSdDocument, referenceSdDocumentItem, material",
              "- sales_order_headers columns: salesOrder, soldToParty, totalNetAmount, overallDeliveryStatus, overallOrdReltdBillgStatus",
              "- outbound_delivery_items columns: deliveryDocument, referenceSdDocument, referenceSdDocumentItem, plant",
              "- payments_accounts_receivable columns: accountingDocument, invoiceReference, customer, amountInTransactionCurrency",
              "",
              "Fix the SQL. Return ONLY the corrected raw SQL query, no explanation, no backticks.",
            ].join("\n"),
          },
        ],
      });

      const fixedSql = cleanSql(fixResponse.choices[0].message.content || "");
      results = db.prepare(fixedSql).all();
    }

    const answerResponse = await client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "You answer questions clearly and concisely from result data.",
        },
        {
          role: "user",
          content: [
            `Given these query results in JSON: ${JSON.stringify(results)}`,
            `Answer this question in plain English: ${message}`,
            "Be concise. Use actual numbers from the data.",
          ].join("\n"),
        },
      ],
    });

    const answer = (answerResponse.choices[0].message.content || "").trim();
    return res.json({ answer });
  } catch (error) {
    console.error("Chat route error:", error);
    return res.json({ answer: "Sorry, could not process that query." });
  }
});

module.exports = router;
