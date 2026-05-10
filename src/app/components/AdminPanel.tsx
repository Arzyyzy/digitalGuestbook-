import { Download, X, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

interface Message {
  id: string;
  imageData: string;
  timestamp: number;
}

interface AdminPanelProps {
  messages: Message[];
  onClose: () => void;
  onEndEvent: () => void;
}

export function AdminPanel({ messages, onClose, onEndEvent }: AdminPanelProps) {
  const [showConfirm, setShowConfirm] = useState(false);

  const downloadJSON = () => {
    const dataStr = JSON.stringify(messages, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `guestbook-${new Date().toISOString()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadImages = () => {
    messages.forEach((msg, index) => {
      const link = document.createElement('a');
      link.href = msg.imageData;
      link.download = `message-${index + 1}.png`;
      link.click();
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-[#D4AF37] to-[#F4D03F] p-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Admin Panel</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-white" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="flex gap-3">
            <button
              onClick={downloadJSON}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
              Download JSON
            </button>
            <button
              onClick={downloadImages}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Download className="w-5 h-5" />
              Download Images
            </button>
            <button
              onClick={() => setShowConfirm(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              <CheckCircle2 className="w-5 h-5" />
              Selesaikan Event
            </button>
          </div>

          <div className="border-t pt-4">
            <h3 className="text-lg font-semibold mb-4">
              Total Pesan: {messages.length}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className="border rounded-lg p-3 space-y-2 hover:shadow-lg transition-shadow"
                >
                  <img
                    src={msg.imageData}
                    alt="Message"
                    className="w-full h-40 object-contain bg-gray-50 rounded"
                  />
                  <p className="text-xs text-gray-500">
                    {new Date(msg.timestamp).toLocaleString('id-ID')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showConfirm && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl p-6 max-w-md mx-4 space-y-4">
            <h3 className="text-xl font-bold">Konfirmasi</h3>
            <p>Apakah Anda yakin ingin mengakhiri event dan mereset semua data?</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => {
                  onEndEvent();
                  setShowConfirm(false);
                  onClose();
                }}
                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Ya, Selesaikan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
