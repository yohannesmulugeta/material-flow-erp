import React, { useState } from 'react';
import { uploadProductImage } from '@/api/supabaseClient';
import { Button } from '@/components/ui/button';
import { ImagePlus, Loader2, X } from 'lucide-react';

// Single main image uploader
export function MainImageUpload({ value, onChange, folder = 'products' }) {
  const [uploading, setUploading] = useState(false);

  async function handle(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadProductImage(file, folder);
      onChange(url);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="flex items-center gap-3">
      <div className="w-20 h-20 rounded-xl border-2 border-dashed border-border bg-muted/30 flex items-center justify-center overflow-hidden flex-shrink-0">
        {value ? (
          <img src={value} alt="Product" className="w-full h-full object-cover" />
        ) : (
          <ImagePlus className="w-6 h-6 text-muted-foreground/50" />
        )}
      </div>
      <div className="space-y-1.5">
        <label className="cursor-pointer">
          <input type="file" accept="image/*" className="sr-only" onChange={handle} />
          <Button type="button" variant="outline" size="sm" asChild disabled={uploading}>
            <span>{uploading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading…</> : 'Upload Image'}</span>
          </Button>
        </label>
        {value && (
          <button type="button" className="block text-xs text-destructive hover:underline" onClick={() => onChange('')}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

// Multiple additional images (stored as JSON array string)
export function MultiImageUpload({ value, onChange, folder = 'products' }) {
  const [uploading, setUploading] = useState(false);
  let images = [];
  try { images = value ? (typeof value === 'string' ? JSON.parse(value) : value) : []; } catch { images = []; }

  async function handle(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setUploading(true);
    try {
      const urls = [];
      for (const f of files) urls.push(await uploadProductImage(f, folder));
      onChange(JSON.stringify([...images, ...urls]));
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  function remove(i) {
    onChange(JSON.stringify(images.filter((_, idx) => idx !== i)));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {images.map((url, i) => (
          <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
            <img src={url} alt="" className="w-full h-full object-cover" />
            <button type="button" onClick={() => remove(i)}
              className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        <label className="cursor-pointer w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center hover:bg-muted/30">
          <input type="file" accept="image/*" multiple className="sr-only" onChange={handle} />
          {uploading ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <ImagePlus className="w-5 h-5 text-muted-foreground/50" />}
        </label>
      </div>
    </div>
  );
}
