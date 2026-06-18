import React from "react";
import { QRCodeCanvas } from "qrcode.react";

export default function QRCodeBox({ value, size = 132, label = null, className = "", quiet = false }) {
  if (!value) return null;
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className="bg-white p-1.5 rounded-md inline-flex items-center justify-center">
        <QRCodeCanvas value={String(value)} size={size} level="M" includeMargin={false} />
      </div>
      {!quiet && label !== "" && <div className="text-[10px] font-mono text-gray-600 mt-1 break-all text-center max-w-full">{label || value}</div>}
    </div>
  );
}
