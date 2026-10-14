import { useMemo } from "react";
import { encode } from "uqr";

/** A QRIS payload drawn as one SVG path (dark modules on white, 4-module quiet zone). */
export default function QrisCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: "M", border: 4 });
    let d = "";
    qr.data.forEach((row, y) => row.forEach((dark, x) => {
      if (dark) d += `M${x} ${y}h1v1h-1z`;
    }));
    return { size: qr.size, path: d };
  }, [value]);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges" className="block aspect-square w-full bg-white">
      <path d={path} fill="#000" />
    </svg>
  );
}
