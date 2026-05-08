"use strict";
const http = require("http");
const paths = [
  "/api/operator/deposit-followups",
  "/api/operator/garment-orders",
  "/api/reports/run",
  "/dashboard",
  "/api/social/posts",
];
let pending = paths.length;
paths.forEach((p) => {
  http
    .get(`http://127.0.0.1:3847${p}`, (r) => {
      console.log(p, r.statusCode);
      r.resume();
      if (--pending === 0) process.exit(0);
    })
    .on("error", (e) => {
      console.log(p, "ERR", e.message);
      if (--pending === 0) process.exit(1);
    });
});
