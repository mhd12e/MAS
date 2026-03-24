import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { apiGet, apiPost, apiDelete } from '@/lib/api';
import { Plus, Trash2, Copy, Check, Key, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface ApiKeyView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export function ApiKeysPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKeyView[]>([]);
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null); // shown once after creation
  const [copied, setCopied] = useState(false);

  const loadKeys = useCallback(() => {
    apiGet('/auth/keys')
      .then((r) => r.json())
      .then(setKeys)
      .catch(() => {});
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const createKey = async () => {
    if (!name.trim()) return;
    const res = await apiPost('/auth/keys', { name: name.trim() });
    if (res.ok) {
      const data = await res.json();
      setNewKey(data.key);
      setName('');
      loadKeys();
    }
  };

  const deleteKey = async (id: string) => {
    await apiDelete(`/auth/keys/${id}`);
    loadKeys();
  };

  const copyKey = () => {
    if (newKey) {
      navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto max-w-3xl px-6 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="w-px h-5 bg-border" />
          <Key className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold text-foreground">API Keys</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-6">
        {/* Info */}
        <div className="text-sm text-muted-foreground leading-relaxed">
          <p>API keys allow external applications to authenticate with Mobile Agent Studio.</p>
          <p className="mt-1">Include the key in your requests as: <code className="text-xs bg-muted px-1.5 py-0.5 rounded">X-API-Key: mas_...</code></p>
        </div>

        {/* New key reveal */}
        {newKey && (
          <Card className="border-warning/30 bg-warning/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-warning mb-2">Copy your API key now — it won't be shown again</p>
                  <div className="flex gap-2">
                    <code className="flex-1 text-xs bg-background border border-border rounded px-3 py-2 font-mono truncate select-all">
                      {newKey}
                    </code>
                    <Button size="sm" variant="outline" onClick={copyKey} className="gap-1.5 flex-shrink-0">
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Create key */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Key name (e.g. CI Pipeline, My Script)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createKey()}
                className="bg-input"
              />
              <Button onClick={createKey} disabled={!name.trim()} className="gap-1.5 flex-shrink-0">
                <Plus className="h-3.5 w-3.5" />
                Create Key
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Key list */}
        {keys.length > 0 && (
          <Card>
            <CardContent className="p-0">
              {keys.map((key, i) => (
                <div key={key.id}>
                  {i > 0 && <Separator />}
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{key.name}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        <code className="font-mono">{key.prefix}</code>
                        <span>Created {new Date(key.createdAt).toLocaleDateString()}</span>
                        {key.lastUsedAt && (
                          <span>Last used {new Date(key.lastUsedAt).toLocaleDateString()}</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteKey(key.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {keys.length === 0 && !newKey && (
          <p className="text-xs text-muted-foreground text-center py-8">No API keys yet.</p>
        )}
      </main>
    </div>
  );
}
