import React, { useState, useRef } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedDataUrl: string) => void;
  onCancel: () => void;
  aspect?: number;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  imageSrc,
  onCropComplete,
  onCancel,
  aspect,
}) => {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const imgRef = useRef<HTMLImageElement>(null);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (aspect) {
      const crop = centerCrop(
        makeAspectCrop(
          { unit: "%", width: 90 },
          aspect,
          naturalWidth,
          naturalHeight
        ),
        naturalWidth,
        naturalHeight
      );
      setCrop(crop);
    } else {
      // Default to 90% size, centered
      const width = Math.min(naturalWidth * 0.9, naturalHeight * 0.9);
      setCrop(
        centerCrop(
          { unit: "px", width, height: width },
          naturalWidth,
          naturalHeight
        )
      );
    }
  }

  const handleCrop = () => {
    if (!completedCrop || !imgRef.current) {
      onCancel();
      return;
    }
    
    if (completedCrop.width === 0 || completedCrop.height === 0) {
      onCancel();
      return;
    }
    
    const canvas = document.createElement("canvas");
    const image = imgRef.current;
    
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext("2d");
    
    if (!ctx) {
      onCancel();
      return;
    }
    
    ctx.imageSmoothingQuality = 'high';
    
    ctx.drawImage(
      image,
      completedCrop.x * scaleX,
      completedCrop.y * scaleY,
      completedCrop.width * scaleX,
      completedCrop.height * scaleY,
      0,
      0,
      completedCrop.width,
      completedCrop.height
    );
    
    const base64Image = canvas.toDataURL("image/jpeg", 0.9);
    onCropComplete(base64Image);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-3xl w-full max-h-[95vh] flex flex-col">
        <h3 className="text-lg font-bold mb-4">Media</h3>
        <div className="flex-1 overflow-auto bg-stone-100 flex items-center justify-center mb-6 min-h-[300px]">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
          >
            <img 
              ref={imgRef} 
              src={imageSrc} 
              onLoad={onImageLoad} 
              alt="Crop me" 
              className="max-h-[65vh] w-auto object-contain"
            />
          </ReactCrop>
        </div>
        <div className="flex justify-start gap-4">
          <button
            onClick={onCancel}
            className="px-6 py-2.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCrop}
            className="px-6 py-2.5 rounded-full bg-[#0088ff] hover:bg-[#0077ee] text-white font-medium transition-colors"
          >
            Crop
          </button>
        </div>
      </div>
    </div>
  );
};
