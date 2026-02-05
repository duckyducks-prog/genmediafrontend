import "./spinner.css";

interface SpinnerProps {
  size?: number;
  className?: string;
}

export function Spinner({ size = 20, className = "" }: SpinnerProps) {
  return (
    <div 
      className={`workflow-spinner ${className}`}
      style={{ 
        width: `${size}px`, 
        height: `${size}px`,
      }}
    >
      <div className="workflow-spinner-inner">
        <div></div><div></div><div></div><div></div>
        <div></div><div></div><div></div><div></div>
        <div></div><div></div><div></div><div></div>
      </div>
    </div>
  );
}
