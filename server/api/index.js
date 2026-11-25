// Điểm vào Vercel serverless: Express app chính là một hàm (req, res).
// vercel.json chuyển mọi đường dẫn về đây; Express nhận nguyên URL gốc (/api/...).
export { default } from '../src/app.js';
