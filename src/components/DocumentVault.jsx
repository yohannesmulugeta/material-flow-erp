import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, FileText, Trash2, Eye, Loader2, Paperclip } from 'lucide-react';
import { format } from 'date-fns';

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ALLOWED_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/csv', 'text/plain',
];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export default function DocumentVault({ entityType, entityId, className = '' }) {
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  const queryKey = ['attachments', entityType, entityId];

  const { data: attachments = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', String(entityId))
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!entityType && !!entityId,
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachment) => {
      await supabase.storage.from('attachments').remove([attachment.storage_path]);
      const { error } = await supabase.from('attachments').delete().eq('id', attachment.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (file.size > MAX_SIZE) {
      setError('File too large (max 10 MB)');
      return;
    }
    const mimeOk = ALLOWED_TYPES.includes(file.type) ||
      /\.(pdf|jpg|jpeg|png|webp|heic|xlsx|docx|csv|txt)$/i.test(file.name);
    if (!mimeOk) {
      setError('File type not allowed');
      return;
    }

    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({
        file,
        entityType,
        entityId: String(entityId),
      });
      await supabase.from('attachments').insert({
        entity_type: entityType,
        entity_id: String(entityId),
        storage_path: result.storage_path,
        file_name: result.file_name,
        file_size: result.file_size,
        mime_type: result.mime_type,
        uploaded_at: new Date().toISOString(),
      });
      qc.invalidateQueries({ queryKey });
    } catch (err) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleView(attachment) {
    try {
      const { data, error } = await supabase.storage
        .from('attachments')
        .createSignedUrl(attachment.storage_path, 3600);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err) {
      alert('Could not open file: ' + err.message);
    }
  }

  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Paperclip className="w-4 h-4" />
          <span>Documents ({attachments.length})</span>
        </div>
        <label className="cursor-pointer">
          <input type="file" className="sr-only" onChange={handleFileSelect}
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.xlsx,.docx,.csv,.txt" />
          <Button variant="outline" size="sm" asChild disabled={uploading}>
            <span>
              {uploading
                ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Uploading…</>
                : <><Upload className="w-3.5 h-3.5 mr-1.5" />Attach file</>
              }
            </span>
          </Button>
        </label>
      </div>

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}

      {isLoading ? (
        <div className="h-8 flex items-center text-xs text-muted-foreground">Loading…</div>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No documents attached.</p>
      ) : (
        <ul className="space-y-1.5">
          {attachments.map(att => (
            <li key={att.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate font-medium">{att.file_name}</span>
              {att.file_size && (
                <span className="text-xs text-muted-foreground shrink-0">{fmtSize(att.file_size)}</span>
              )}
              {att.uploaded_at && (
                <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                  {format(new Date(att.uploaded_at), 'MMM d, yyyy')}
                </span>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                onClick={() => handleView(att)} title="View">
                <Eye className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                onClick={() => deleteMutation.mutate(att)} title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
