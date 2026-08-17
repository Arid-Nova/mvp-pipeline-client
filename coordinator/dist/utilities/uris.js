"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.API_URLS = void 0;
exports.API_URLS = {
    SESSION: process.env.SESSION_API_URL || 'http://localhost:8080',
    IR: process.env.IR_API_URL || 'http://localhost:8080',
    COMPONENT: process.env.COMPONENT_API_URL || 'http://localhost:8060',
    VECTOR: process.env.VECTOR_API_URL || 'http://localhost:8050',
    ANALYSIS: process.env.ANALYSIS_API_URL || 'http://localhost:8040',
    VERIFY: process.env.VERIFY_API_URL || 'http://localhost:9000',
    TEST: process.env.TEST_API_URL || 'http://localhost:8030',
    AEGIS: process.env.AEGIS_API_URL || 'http://localhost:8900'
};
