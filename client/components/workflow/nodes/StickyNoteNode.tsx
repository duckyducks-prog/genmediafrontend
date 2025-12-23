import { memo, useState } from "react";
import { NodeProps, useReactFlow } from "reactflow";
import { StickyNoteNodeData } from "../types";
import { Trash2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

const COLOR_OPTIONS = [
  { name: "yellow", bg: "bg-yellow-100", border: "border-yellow-300", text: "text-yellow-900" },
  { name: "blue", bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-900" },
  { name: "pink", bg: "bg-pink-100", border: "border-pink-300", text: "text-pink-900" },
  { name: "purple", bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-900" },
];

function StickyNoteNode({ data, id }: NodeProps<StickyNoteNodeData>) {
  const { setNodes, deleteElements } = useReactFlow();
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [labelInput, setLabelInput] = useState(data.label || "Sticky Note");

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

  return (
    <div
      className={`${currentColor.bg} ${currentColor.border} sticky-note-node rounded-lg border-2 shadow-md p-3 w-64 h-64 flex flex-col transition-all hover:shadow-lg ${
        data.readOnly ? "opacity-75" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2 pb-2 border-b border-current border-opacity-20">
        <div className="flex items-center gap-1 flex-1">
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
              className={`flex-1 bg-transparent font-semibold text-sm ${currentColor.text} outline-none border-0 p-0`}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <div
              className={`flex-1 font-semibold text-sm ${currentColor.text} cursor-pointer hover:opacity-70`}
              onDoubleClick={() => !data.readOnly && setIsEditingLabel(true)}
            >
              {data.label || "Sticky Note"}
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1 ml-2">
          {!data.readOnly && (
            <>
              {/* Color picker toggle */}
              <div className="relative">
                <button
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className={`p-1 rounded hover:opacity-70 transition-opacity ${currentColor.text}`}
                  title="Change color"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <div className={`w-4 h-4 rounded border-2 ${currentColor.border}`} />
                </button>

                {/* Color picker dropdown */}
                {showColorPicker && (
                  <div className="absolute right-0 top-full mt-1 p-2 bg-white rounded-md shadow-lg border border-gray-200 z-50 flex gap-2">
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
                className={`p-1 rounded hover:opacity-70 transition-opacity ${currentColor.text}`}
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
        className={`flex-1 bg-transparent ${currentColor.text} placeholder-current placeholder-opacity-40 text-sm resize-none outline-none border-0 p-0 font-normal`}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default memo(StickyNoteNode);
