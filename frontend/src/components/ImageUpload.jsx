import React, { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon, Loader2 } from "lucide-react";
import api, { API_URL } from "@/lib/api";
import { toast } from "sonner";

// Returns absolute URL for /api/uploads/* paths
export function resolveImageUrl(url) {
  if (!url) return "";
  if (url.startsWith("http") || url.startsWith("data:")) return url;
  if (url.startsWith("/api/uploads/")) {
    const backend = process.env.REACT_APP_BACKEND_URL;
    return `${backend}${url}`;
  }
  return url;
}

export default function ImageUpload({ value, onChange, label = "Foto", testid = "image-upload" }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("Ukuran maksimal 5MB");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const token = localStorage.getItem("aw_token");
      const res = await fetch(`${API_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error("Upload gagal");
      const data = await res.json();
      onChange(data.url);
      toast.success("Foto diupload");
    } catch (err) {
      toast.error("Gagal upload");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const clear = () => onChange("");

  return (
    <div data-testid={testid}>
      {label && <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>}
      {value ? (
        <div className="relative inline-block">
          <img src={resolveImageUrl(value)} alt="preview" className="w-32 h-32 object-cover rounded-lg border border-gray-200" />
          <button type="button" onClick={clear} data-testid={`${testid}-clear`}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600">
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}
          data-testid={`${testid}-btn`}
          className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-[#1a6b3c] hover:text-[#1a6b3c] transition-colors">
          {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <ImageIcon className="w-6 h-6" />}
          <span className="text-xs font-medium">{uploading ? "Mengunggah..." : "Pilih Foto"}</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} className="hidden" />
    </div>
  );
}
