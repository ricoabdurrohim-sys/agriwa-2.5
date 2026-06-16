import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function Barcode({ value, width = 1.4, height = 48, fontSize = 12, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, String(value), {
        format: "CODE128",
        width,
        height,
        fontSize,
        margin: 4,
        displayValue: true,
      });
    } catch (e) {
      // fallback rendered below
    }
  }, [value, width, height, fontSize]);
  if (!value) return null;
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <svg ref={ref} role="img" aria-label={`Barcode ${value}`} />
      <div className="text-[10px] font-mono text-gray-500 mt-0.5 break-all hidden print:block">{value}</div>
    </div>
  );
}
