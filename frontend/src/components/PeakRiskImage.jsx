import { ImageIcon } from "lucide-react";

export function PeakRiskImage({ imageDataUrl, peakEvent }) {
  if (!imageDataUrl) return null;

  return (
    <section className="panel peak-image-panel">
      <div className="panel-heading">
        <h3>
          <ImageIcon size={18} /> 최대 위험 순간
        </h3>
        <span>
          {peakEvent?.second ?? "-"}초 · RULA {peakEvent?.score ?? "-"}점
        </span>
      </div>
      <img src={imageDataUrl} alt="최대 위험 순간 자세 분석 이미지" />
    </section>
  );
}
