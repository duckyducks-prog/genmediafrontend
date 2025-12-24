import { memo, useState, useRef, useEffect } from "react";
import { NodeProps, useReactFlow } from "reactflow";
import { StickyNoteNodeData } from "../types";
import { Trash2, MessageSquare, Pencil } from "lucide-react";

const COLOR_OPTIONS = [
  { name: "yellow", bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-900" },
  { name: "blue", bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-900" },
  { name: "pink", bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-900" },
  { name: "purple", bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-900" },
];

const MIN_WIDTH = 150;
const MIN_HEIGHT = 150;
const DEFAULT_WIDTH = 256;
const DEFAULT_HEIGHT = 256;

function StickyNoteNode({ data, id }: NodeProps<StickyNoteNodeData>) {
  const { setNodes, deleteElements } = useReactFlow();
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [labelInput, setLabelInput] = useState(data.label || "Sticky Note");
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  const width = data.width || DEFAULT_WIDTH;
  const height = data.height || DEFAULT_HEIGHT;
  const currentColor = COLOR_OPTIONS.find((c) => c.name === (data.color || "yellow")) || COLOR_OPTIONS[0];

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (data.readOnly) return;

    const newContent = e.target.value;
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                content: newContent,
              },
            }
          : node,
      ),
    );
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLabelInput(e.target.value);
  };

  const handleLabelSave = () => {
    if (data.readOnly) return;

    const newLabel = labelInput.trim() || "Sticky Note";
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                label: newLabel,
              },
            }
          : node,
      ),
    );
    setIsEditingLabel(false);
  };

  const handleColorChange = (colorName: string) => {
    if (data.readOnly) return;

    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? {
              ...node,
              data: {
                ...node.data,
                color: colorName,
              },
            }
          : node,
      ),
    );
    setShowColorPicker(false);
  };

  const handleDelete = () => {
    deleteElements({ nodes: [{ id }] });
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    if (data.readOnly) return;

    e.preventDefault();
    e.stopPropagation();

    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width,
      height,
    };

    setIsResizing(true);
  };

  // Handle resize with mouse move
  useEffect(() => {
    if (!isResizing || !resizeStartRef.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeStartRef.current) return;

      const deltaX = e.clientX - resizeStartRef.current.x;
      const deltaY = e.clientY - resizeStartRef.current.y;

      const newWidth = Math.max(MIN_WIDTH, resizeStartRef.current.width + deltaX);
      const newHeight = Math.max(MIN_HEIGHT, resizeStartRef.current.height + deltaY);

      setNodes((nodes) =>
        nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  width: newWidth,
                  height: newHeight,
                },
              }
            : node,
        ),
      );
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeStartRef.current = null;
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, id, setNodes]);

  return (
    <div
      className={`${currentColor.bg} ${currentColor.border} sticky-note-node rounded-lg border-2 shadow-md p-3 flex flex-col transition-shadow hover:shadow-lg ${
        data.readOnly ? "opacity-75" : ""
      } ${isResizing ? "cursor-nwse-resize" : ""}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2 pb-2 border-b border-current border-opacity-20">
        <div className="flex items-center gap-1 flex-1 min-w-0">
          <MessageSquare className={`w-4 h-4 ${currentColor.text} flex-shrink-0`} />
          {isEditingLabel ? (
            <input
              autoFocus
              type="text"
              value={labelInput}
              onChange={handleLabelChange}
              onBlur={handleLabelSave}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLabelSave();
                if (e.key === "Escape") {
                  setLabelInput(data.label || "Sticky Note");
                  setIsEditingLabel(false);
                }
              }}
              className={`nodrag flex-1 bg-transparent font-semibold text-sm ${currentColor.text} outline-none border-0 p-0 min-w-0 truncate`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div className="flex items-center gap-1 flex-1 min-w-0 group">
              <div
                className={`flex-1 font-semibold text-sm ${currentColor.text} cursor-pointer hover:opacity-70 min-w-0 truncate`}
                onDoubleClick={() => !data.readOnly && setIsEditingLabel(true)}
                onClick={() => !data.readOnly && setIsEditingLabel(true)}
              >
                {data.label || "Sticky Note"}
              </div>
              {!data.readOnly && (
                <button
                  onClick={() => setIsEditingLabel(true)}
                  className={`nodrag opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-black hover:bg-opacity-10 ${currentColor.text}`}
                  title="Edit label"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Pencil className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 ml-2 flex-shrink-0">
          {!data.readOnly && (
            <>
              {/* Color picker toggle */}
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className={`nodrag p-1 rounded hover:opacity-70 transition-opacity ${currentColor.text}`}
                  title="Change color"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className={`w-4 h-4 rounded border-2 ${currentColor.border}`} />
                </button>

                {/* Color picker dropdown */}
                {showColorPicker && (
                  <div className="nodrag absolute right-0 top-full mt-1 p-2 bg-white rounded-md shadow-lg border border-gray-200 z-50 flex gap-2">
                    {COLOR_OPTIONS.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => handleColorChange(color.name)}
                        className={`w-5 h-5 rounded border-2 ${color.bg} ${color.border} hover:scale-110 transition-transform`}
                        title={color.name}
                        onMouseDown={(e) => e.preventDefault()}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Delete button */}
              <button
                onClick={handleDelete}
                className={`nodrag p-1 rounded hover:opacity-70 transition-opacity ${currentColor.text}`}
                title="Delete note"
                onMouseDown={(e) => e.preventDefault()}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content area */}
      <textarea
        value={data.content || ""}
        onChange={handleContentChange}
        disabled={data.readOnly}
        placeholder="Enter your note here..."
        className={`nodrag flex-1 bg-transparent ${currentColor.text} placeholder-current placeholder-opacity-40 text-sm resize-none outline-none border-0 p-0 font-normal overflow-auto`}
        onClick={(e) => e.stopPropagation()}
      />

      {/* Resize handle */}
      {!data.readOnly && (
        <div
          className={`nodrag absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize select-none rounded-tl ${currentColor.bg} ${currentColor.border} border-t border-l opacity-60 hover:opacity-100 transition-opacity`}
          onMouseDown={handleResizeStart}
          title="Drag to resize"
          style={{
            position: "absolute",
            bottom: 0,
            right: 0,
          }}
        />
      )}
    </div>
  );
}

export default memo(StickyNoteNode);
