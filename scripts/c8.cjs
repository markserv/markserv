#!/usr/bin/env node
const {createRequire} = require('node:module');

const customRequire = createRequire(__filename);
customRequire('c8/bin/c8');
