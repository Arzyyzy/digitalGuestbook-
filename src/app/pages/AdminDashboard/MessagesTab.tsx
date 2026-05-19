import { useState, useEffect, useCallback } from 'react';
import { useGuestbook } from '../../contexts/GuestbookContext';
import { useRealtimeSubscription } from '../../hooks/useRealtimeMessages';
import { getGuestMessages, GuestMessage } from '../../../lib/supabaseMessages';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card } from '../../components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from '../../components/ui/alert-dialog';

interface DisplayMessage {
  id: string;
  waktu: string;
  pesanImageUrl: string;
  guestName?: string;
}

const EVENT_ID = 'default-event';

export function MessagesTab() {
  const { deleteMessage, storageError, isOnline } = useGuestbook();
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const { isSubscribed } = useRealtimeSubscription(
    EVENT_ID,
    (newMsg) => {
      setMessages(prev => {
        const exists = prev.some(m => m.id === newMsg.id);
        if (!exists) {
          return [
            {
              id: newMsg.id,
              waktu: newMsg.createdAt,
              pesanImageUrl: newMsg.imageUrl,
              guestName: newMsg.guestName,
            },
            ...prev,
          ];
        }
        return prev;
      });
    },
    (deletedId) => {
      setMessages(prev => prev.filter(m => m.id !== deletedId));
    }
  );

  useEffect(() => {
    const loadMessages = async () => {
      try {
        setLoading(true);
        setError(null);
        const msgs = await getGuestMessages(EVENT_ID);
        setMessages(
          msgs.map(m => ({
            id: m.id,
            waktu: m.createdAt,
            pesanImageUrl: m.imageUrl,
            guestName: m.guestName,
          }))
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load messages');
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        setDeleting(id);
        await deleteMessage(id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete message');
      } finally {
        setDeleting(null);
      }
    },
    [deleteMessage]
  );

  const filteredMessages = messages.filter(msg => {
    const matchesSearch =
      !searchTerm ||
      msg.guestName?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesDate =
      !filterDate || new Date(msg.waktu).toLocaleDateString() === filterDate;

    return matchesSearch && matchesDate;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-slate-400">Loading messages...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header with Connection Status */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Guest Messages</h2>
            <p className="text-slate-400 text-sm mt-1">Total: {filteredMessages.length} pesan tamu</p>
          </div>
          
          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg" style={{ 
            background: 'rgba(255,255,255,0.04)', 
            border: `1px solid ${isOnline && isSubscribed ? 'rgba(16,185,129,0.3)' : 'rgba(59,130,246,0.2)'}`,
          }}>
            <div 
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: isOnline && isSubscribed ? '#10b981' : isOnline ? '#f59e0b' : '#ef4444',
                animation: isOnline && isSubscribed ? 'pulse 2s infinite' : 'none',
              }}
            />
            <span className="text-xs font-medium text-slate-300">
              {isOnline && isSubscribed ? '● Live Realtime' : isOnline ? '⏳ Connecting...' : '❌ Offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          placeholder="Search by guest name..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="bg-slate-800 border-slate-700"
        />
        <Input
          type="date"
          value={filterDate}
          onChange={e => setFilterDate(e.target.value)}
          className="bg-slate-800 border-slate-700"
        />
      </div>

      {/* Error messages */}
      {error && (
        <div className="p-4 bg-red-900/20 border border-red-700 rounded-lg text-red-200">
          {error}
        </div>
      )}

      {storageError && (
        <div className="p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg text-yellow-200">
          {storageError}
        </div>
      )}

      {/* Messages Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMessages.length === 0 ? (
          <div className="col-span-full text-center p-12 text-slate-400">
            <p className="text-lg">No messages found</p>
            <p className="text-sm mt-2">Messages akan muncul di sini secara realtime</p>
          </div>
        ) : (
          filteredMessages.map(msg => (
            <Card
              key={msg.id}
              className="overflow-hidden bg-slate-800/50 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800 transition-all duration-200 group"
            >
              {/* Image preview with overlay */}
              <div className="aspect-video bg-slate-900 overflow-hidden relative">
                <img
                  src={msg.pesanImageUrl}
                  alt={msg.guestName || 'Message'}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22225%22%3E%3Crect fill=%22%23374151%22 width=%22400%22 height=%22225%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23999%22 text-anchor=%22middle%22 dominant-baseline=%22middle%22%3EImage Error%3C/text%3E%3C/svg%3E';
                  }}
                />
                {/* Timestamp badge */}
                <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm">
                  <p className="text-xs font-medium text-white">
                    {new Date(msg.waktu).toLocaleTimeString('id-ID', { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>
              </div>

              {/* Message info */}
              <div className="p-4 space-y-3">
                {msg.guestName && (
                  <div>
                    <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Guest</p>
                    <p className="font-semibold text-white truncate">{msg.guestName}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs uppercase tracking-wider text-slate-500 mb-1">Received</p>
                  <p className="text-sm text-slate-300">
                    {new Date(msg.waktu).toLocaleDateString('id-ID', {
                      weekday: 'short',
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>

                {/* Delete button */}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full mt-2"
                      disabled={deleting === msg.id}
                    >
                      {deleting === msg.id ? (
                        <>
                          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2"></span>
                          Menghapus...
                        </>
                      ) : (
                        '🗑 Hapus Pesan'
                      )}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogTitle>Hapus pesan?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Pesan akan dihapus secara permanen dan tidak dapat dipulihkan.
                    </AlertDialogDescription>
                    <div className="flex justify-end gap-2">
                      <AlertDialogCancel>Batal</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(msg.id)}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Delete
                      </AlertDialogAction>
                    </div>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
