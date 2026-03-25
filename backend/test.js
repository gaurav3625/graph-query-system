const { db } = require('./db');

// Check if billing items reference delivery docs or sales orders
const billingItem = db.prepare('SELECT * FROM billing_document_items LIMIT 1').get();
console.log('Billing item referenceSdDocument:', billingItem.referenceSdDocument);

// Check outbound delivery headers
const delivery = db.prepare('SELECT * FROM outbound_delivery_headers LIMIT 3').all();
console.log('Delivery docs:', delivery.map(d => d.deliveryDocument));

// Check if billing referenceSdDocument matches delivery docs
const match = db.prepare(`
  SELECT bdi.billingDocument, bdi.referenceSdDocument, odh.deliveryDocument
  FROM billing_document_items bdi
  JOIN outbound_delivery_headers odh ON bdi.referenceSdDocument = odh.deliveryDocument
  LIMIT 5
`).all();
console.log('Billing → Delivery matches:', match);

// Check delivery items → sales order link
const deliveryToSO = db.prepare(`
  SELECT odi.deliveryDocument, odi.referenceSdDocument as salesOrder
  FROM outbound_delivery_items odi
  LIMIT 5
`).all();
console.log('Delivery → Sales Order:', deliveryToSO);