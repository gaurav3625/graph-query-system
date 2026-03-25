const express = require("express");
const { db } = require("../db");

const router = express.Router();

function addNode(nodesMap, id, type, label, keyFields) {
  if (!id || nodesMap.has(id)) return;
  nodesMap.set(id, {
    id,
    type,
    data: {
      label,
      ...keyFields,
    },
  });
}

router.get("/", (req, res) => {
  try {
    const nodesMap = new Map();
    const edgesMap = new Map();

    const salesOrders = db
      .prepare(
        `SELECT salesOrder, soldToParty, totalNetAmount, overallDeliveryStatus, overallOrdReltdBillgStatus
         FROM sales_order_headers
         LIMIT 25`
      )
      .all();
    for (const row of salesOrders) {
      addNode(nodesMap, `SO-${row.salesOrder}`, "SalesOrder", `SO ${row.salesOrder}`, {
        salesOrder: row.salesOrder,
        soldToParty: row.soldToParty,
        totalNetAmount: row.totalNetAmount,
        overallDeliveryStatus: row.overallDeliveryStatus,
        overallOrdReltdBillgStatus: row.overallOrdReltdBillgStatus,
      });
    }

    const deliveries = db
      .prepare(
        `SELECT deliveryDocument, shippingPoint, overallGoodsMovementStatus
         FROM outbound_delivery_headers
         LIMIT 25`
      )
      .all();
    for (const row of deliveries) {
      addNode(
        nodesMap,
        `DEL-${row.deliveryDocument}`,
        "Delivery",
        `Delivery ${row.deliveryDocument}`,
        {
          deliveryDocument: row.deliveryDocument,
          shippingPoint: row.shippingPoint,
          overallGoodsMovementStatus: row.overallGoodsMovementStatus,
        }
      );
    }

    const billings = db
      .prepare(
        `SELECT billingDocument, soldToParty, totalNetAmount, billingDocumentDate
         FROM billing_document_headers
         LIMIT 25`
      )
      .all();
    for (const row of billings) {
      addNode(
        nodesMap,
        `BILL-${row.billingDocument}`,
        "Billing",
        `Billing ${row.billingDocument}`,
        {
          billingDocument: row.billingDocument,
          soldToParty: row.soldToParty,
          totalNetAmount: row.totalNetAmount,
          billingDocumentDate: row.billingDocumentDate,
        }
      );
    }

    const payments = db
      .prepare(
        `SELECT accountingDocument, customer, invoiceReference, amountInTransactionCurrency
         FROM payments_accounts_receivable
         LIMIT 25`
      )
      .all();
    for (const row of payments) {
      addNode(
        nodesMap,
        `PAY-${row.accountingDocument}`,
        "Payment",
        `Payment ${row.accountingDocument}`,
        {
          accountingDocument: row.accountingDocument,
          customer: row.customer,
          invoiceReference: row.invoiceReference,
          amountInTransactionCurrency: row.amountInTransactionCurrency,
        }
      );
    }

    const customers = db
      .prepare(
        `SELECT businessPartner, customer, businessPartnerName, businessPartnerFullName
         FROM business_partners
         LIMIT 25`
      )
      .all();
    for (const row of customers) {
      addNode(nodesMap, `BP-${row.businessPartner}`, "Customer", row.businessPartnerName, {
        businessPartner: row.businessPartner,
        customer: row.customer,
        businessPartnerName: row.businessPartnerName,
        businessPartnerFullName: row.businessPartnerFullName,
      });
    }

    const products = db
      .prepare(
        `SELECT product, productType, division
         FROM products
         LIMIT 25`
      )
      .all();
    for (const row of products) {
      addNode(nodesMap, `PROD-${row.product}`, "Product", `Product ${row.product}`, {
        product: row.product,
        productType: row.productType,
        division: row.division,
      });
    }

    const nodeIds = new Set(nodesMap.keys());

    const soToDelivery = db
      .prepare(
        "SELECT DISTINCT odi.referenceSdDocument as salesOrder, odi.deliveryDocument FROM outbound_delivery_items odi LIMIT 50"
      )
      .all();
    for (const row of soToDelivery) {
      const source = `SO-${row.salesOrder}`;
      const target = `DEL-${row.deliveryDocument}`;
      if (nodeIds.has(source) && nodeIds.has(target)) {
        const id = `e-${source}-${target}`;
        edgesMap.set(id, { id, source, target });
      }
    }

    const deliveryToBilling = db
      .prepare(
        "SELECT DISTINCT bdi.referenceSdDocument as deliveryDocument, bdi.billingDocument FROM billing_document_items bdi LIMIT 50"
      )
      .all();
    for (const row of deliveryToBilling) {
      const source = `DEL-${row.deliveryDocument}`;
      const target = `BILL-${row.billingDocument}`;
      if (nodeIds.has(source) && nodeIds.has(target)) {
        const id = `e-${source}-${target}`;
        edgesMap.set(id, { id, source, target });
      }
    }

    const billingToPayment = db
      .prepare(
        "SELECT DISTINCT par.invoiceReference as billingDocument, par.accountingDocument FROM payments_accounts_receivable par LIMIT 50"
      )
      .all();
    for (const row of billingToPayment) {
      const source = `BILL-${row.billingDocument}`;
      const target = `PAY-${row.accountingDocument}`;
      if (nodeIds.has(source) && nodeIds.has(target)) {
        const id = `e-${source}-${target}`;
        edgesMap.set(id, { id, source, target });
      }
    }

    const customerToSo = db
      .prepare(
        "SELECT DISTINCT soh.soldToParty, soh.salesOrder FROM sales_order_headers soh LIMIT 50"
      )
      .all();
    for (const row of customerToSo) {
      const customerNode = customers.find((c) => c.customer === row.soldToParty);
      if (!customerNode) continue;
      const source = `BP-${customerNode.businessPartner}`;
      const target = `SO-${row.salesOrder}`;
      if (nodeIds.has(source) && nodeIds.has(target)) {
        const id = `e-${source}-${target}`;
        edgesMap.set(id, { id, source, target });
      }
    }

    const soToProduct = db
      .prepare(
        "SELECT DISTINCT soi.salesOrder, soi.material FROM sales_order_items soi LIMIT 50"
      )
      .all();
    for (const row of soToProduct) {
      const source = `SO-${row.salesOrder}`;
      const target = `PROD-${row.material}`;
      if (nodeIds.has(source) && nodeIds.has(target)) {
        const id = `e-${source}-${target}`;
        edgesMap.set(id, { id, source, target });
      }
    }

    return res.json({
      nodes: Array.from(nodesMap.values()),
      edges: Array.from(edgesMap.values()),
    });
  } catch (error) {
    console.error("Failed to build graph:", error);
    return res.status(500).json({ error: "Failed to build graph" });
  }
});

module.exports = router;
