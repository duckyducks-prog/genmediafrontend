import { memo, useEffect, useState } from 'react';
import { Handle, Position, NodeProps, useReactFlow } from 'reactflow';
import { Button } from '@/components/ui/button';
import { DownloadNodeData } from '../types';
import { Download } from 'lucide-react';

function DownloadNode({ data, id }: NodeProps<DownloadNodeData>) {
  const [downloadData, setDownloadData] = useState<string | null>(null);
  const [dataType, setDataType] = useState<'image' | 'video'>('image');
  const { getNode, getEdges } = useReactFlow();

  useEffect(() => {
    // Get data from connected source node
    const edges = getEdges();
    const incomingEdges = edges.filter((edge) => edge.target === id);

    if (incomingEdges.length > 0) {
      const edge = incomingEdges[0];
      const sourceNode = getNode(edge.source);
      
      if (sourceNode) {
        const nodeData = sourceNode.data as any;
        if (nodeData.result) {
          setDownloadData(nodeData.result);
          setDataType(nodeData.type || 'image');
        } else if (nodeData.imageUrl) {
          setDownloadData(nodeData.imageUrl);
          setDataType('image');
        }
      }
    }
  }, [id, getEdges, getNode]);

  const handleDownload = () => {
    if (!downloadData) return;

    const link = document.createElement('a');
    link.href = downloadData;
    const extension = dataType === 'video' ? 'mp4' : 'jpg';
    link.download = `generated-${dataType}-${Date.now()}.${extension}`;
    link.click();
  };

  return (
    <div className="bg-card border-2 border-border rounded-lg p-4 min-w-[200px] shadow-lg">
      {/* Node Header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-border">
        <Download className="w-4 h-4 text-primary" />
        <div className="font-semibold text-sm">{data.label || 'Download'}</div>
      </div>

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        id="download-input"
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
        style={{ top: '50%' }}
      />

      {/* Node Content */}
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground mb-2">
          {downloadData ? (
            <span className="text-foreground font-medium">Ready to download</span>
          ) : (
            <span>No data connected</span>
          )}
        </div>

        <Button
          onClick={handleDownload}
          disabled={!downloadData}
          className="w-full"
          size="sm"
        >
          <Download className="w-3 h-3" />
          Download {dataType}
        </Button>
      </div>
    </div>
  );
}

export default memo(DownloadNode);
