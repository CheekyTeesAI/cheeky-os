"use strict";

require("dotenv/config");
const { register } = require("tsx/cjs/api");
register();
require("./src/api/voice.run.ts");
