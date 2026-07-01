import React, { useState, useRef, useCallback } from "react";
import ReactCrop, {
  Crop,
  PixelCrop,
  centerCrop,
  makeAspectCrop,
} from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedDataUrl: string) => void;
  onCancel: () => void;
  /** Optional aspect ratio lock (width/height). Omit for free crop. */
  aspect?: number;
  /** Label shown at the top of the dialog */
  title?: string;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
  aspect,
  title = "Media",
}) => {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  /** Set an initial crop selection once the image is loaded */
  const onImageLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const { naturalWidth: nw, naturalHeight: nh } = e.currentTarget;
      let initial: Crop;

      if (aspect) {
        initial = centerCrop(
          makeAspectCrop({ unit: "%", width: 90 }, aspect, nw, nh),
          nw,
          nh,
        );
      } else {
        // Free crop — default to 90 % of the image, centered
        initial = centerCrop(
          { unit: "%", width: 90, height: 90 },
          nw,
          nh,
        );
      }
      setCrop(initial);
    },
    [aspect],
  );

  /** Draw the selected region onto a canvas and return a data-URL */
  const handleCrop = () => {
    const image = imgRef.current;
    if (!image || !completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      // Nothing was selected — pass the original image through unchanged
      onCropComplete(imageSrc);
      return;
    }

    // Scale factors between the natural image and the rendered <img> element
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;

    // Output at natural resolution
    const outputW = Math.round(completedCrop.width * scaleX);
    const outputH = Math.round(completedCrop.height * scaleY);

    const canvas = document.createElement("canvas");
    canvas.width = outputW;
    canvas.height = outputH;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      onCropComplete(imageSrc);
      return;
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(
      image,
      /* source */ completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      /* destination */ 0,
      0,
      outputW,
      outputH,
    );

    // Use JPEG for photos / PNG for logos to keep transparency
    const mime = imageSrc.startsWith("data:image/png") ? "image/png" : "image/jpeg";
    const quality = mime === "image/jpeg" ? 0.92 : undefined;
    const result = canvas.toDataURL(mime, quality);
    onCropComplete(result);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxWidth: "min(740px, 98vw)", width: "100%", maxHeight: "95dvh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h3 className="text-base font-bold text-stone-800">{title}</h3>
        </div>

        {/* Crop area */}
        <div
          className="flex-1 overflow-auto flex items-center justify-center bg-stone-100"
          style={{ minHeight: 260 }}
        >
          <ReactCrop
            crop={crop}
            onChange={(_, pct) => setCrop(pct)}
            onComplete={(px) => setCompletedCrop(px)}
            aspect={aspect}
            ruleOfThirds
            style={{ maxHeight: "65dvh" }}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              onLoad={onImageLoad}
              alt="Crop"
              style={{ maxHeight: "65dvh", maxWidth: "100%", display: "block" }}
            />
          </ReactCrop>
        </div>

        {/* Footer buttons */}
        <div className="flex items-center gap-3 px-6 py-4 border-t border-stone-100">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCrop}
            className="px-6 py-2 rounded-full text-sm font-medium text-white transition-colors"
            style={{ background: "#0088ff" }}
          >
            Crop
          </button>
        </div>
      </div>
    </div>
  );
};
