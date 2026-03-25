const express = require("express");
const cors = require("cors");

const { db } = require("./db");
const graphRoutes = require("./routes/graph");
const chatRoutes = require("./routes/chat");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

app.use("/api/graph", graphRoutes);
app.use("/api/chat", chatRoutes);

// Keep db import in use so initialization is explicit.
void db;

app.listen(PORT, () => {
  console.log("Server running on port 5000");
});
