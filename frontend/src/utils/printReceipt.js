export { printReceipt80mm, printReceipt, buildReceipt80mmHtml, rupiah, resolveAssetUrl } from './receiptPrint80mm';
export default async function printReceiptDefault(transaction, options) {
  const mod = await import('./receiptPrint80mm');
  return mod.printReceipt80mm(transaction, options);
}
