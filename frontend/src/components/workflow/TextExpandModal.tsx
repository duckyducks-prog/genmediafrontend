import { useState, useEffect, useRef } from "react";
import { X, Maximize2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface TextExpandModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
}

export function TextExpandModal({
  isOpen,
  onClose,
  title,
  value,
  onChange,
  placeholder = "Enter text...",
  readOnly = false,
}: TextExpandModalProps) {
  const [localValue, setLocalValue] = useState(value);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleSave = () => {
    onChange(localValue);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter to save
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    }
    // Escape to close (without saving)
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(localValue);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop - semi-transparent to show canvas behind */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal - Almost full screen */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl flex flex-col w-[calc(100vw-32px)] h-[calc(100vh-32px)] sm:w-[calc(100vw-48px)] sm:h-[calc(100vh-48px)] max-w-[1400px] max-h-[900px]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30 rounded-t-xl">
          <div className="flex items-center gap-3">
            <Maximize2 className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:block">
              {localValue.length} chars · {localValue.trim() ? localValue.trim().split(/\s+/).length : 0} words
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-8 px-2"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-muted rounded-lg transition-colors"
              title="Close (Esc)"
            >
              <X className="w-5 h-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Content - Full height textarea */}
        <div className="flex-1 p-4 sm:p-6 overflow-hidden min-h-0">
          <Textarea
            ref={textareaRef}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            readOnly={readOnly}
            className="w-full h-full resize-none font-mono text-base leading-relaxed p-4 rounded-lg"
            style={{ minHeight: "100%" }}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border rounded-b-xl">
          <div className="text-xs text-muted-foreground">
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">⌘/Ctrl + Enter</kbd>
            <span className="ml-2">to save</span>
            <span className="mx-2">·</span>
            <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Esc</kbd>
            <span className="ml-2">to cancel</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={handleSave}>
                Save Changes
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
