import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent } from 'react';
import type { SocialKind, SocialTarget } from '../types';
import './ImageCropModal.css';

export type AspectRatioKey = '1:1' | '4:5' | '1.91:1' | '9:16' | 'original';

interface RatioOption {
  key: AspectRatioKey;
  label: string;
  sub: string;
  shapeWidth: number;
  shapeHeight: number;
  ratio: number | null; // null = use natural image ratio
  exportWidth: number;
  exportHeight: number;
}

const RATIO_OPTIONS: RatioOption[] = [
  { key: '1:1', label: '1:1', sub: 'Square', shapeWidth: 16, shapeHeight: 16, ratio: 1, exportWidth: 1080, exportHeight: 1080 },
  { key: '4:5', label: '4:5', sub: 'Portrait', shapeWidth: 14, shapeHeight: 18, ratio: 0.8, exportWidth: 1080, exportHeight: 1350 },
  { key: '1.91:1', label: '1.91:1', sub: 'Landscape', shapeWidth: 20, shapeHeight: 11, ratio: 1.91, exportWidth: 1080, exportHeight: 566 },
  { key: '9:16', label: '9:16', sub: 'Story / Reel', shapeWidth: 11, shapeHeight: 20, ratio: 9 / 16, exportWidth: 1080, exportHeight: 1920 },
  { key: 'original', label: 'Original', sub: 'Full Photo', shapeWidth: 15, shapeHeight: 15, ratio: null, exportWidth: 1080, exportHeight: 1080 },
];

export interface CropResult {
  file: File;
  width: number;
  height: number;
}

interface Props {
  file: File;
  kind?: SocialKind;
  targets?: SocialTarget[];
  onApply: (result: CropResult) => void;
  onUseOriginal: (file: File) => void;
  onCancel: () => void;
}

export function ImageCropModal({ file, kind = 'post', targets = ['instagram'], onApply, onUseOriginal, onCancel }: Props) {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  // Default ratio based on kind and target
  const initialRatioKey: AspectRatioKey = kind === 'story' || kind === 'reel' ? '9:16' : '1:1';
  const [selectedRatioKey, setSelectedRatioKey] = useState<AspectRatioKey>(initialRatioKey);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [rotation, setRotation] = useState<number>(0); // 0, 90, 180, 270
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; startPanX: number; startPanY: number }>({ x: 0, y: 0, startPanX: 0, startPanY: 0 });

  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Load image object URL
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    const img = new Image();
    img.onload = () => {
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      // Smart default: If image is noticeably portrait (<= 0.85), default to 4:5 for feed posts
      if (kind === 'post' || kind === 'carousel') {
        const r = img.naturalWidth / img.naturalHeight;
        if (r <= 0.85) {
          setSelectedRatioKey('4:5');
        } else if (r >= 1.5) {
          setSelectedRatioKey('1.91:1');
        } else {
          setSelectedRatioKey('1:1');
        }
      }
    };
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file, kind]);

  // Reset pan and zoom when ratio changes
  const handleRatioChange = (key: AspectRatioKey) => {
    setSelectedRatioKey(key);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  const handleRotate = () => {
    setRotation((r) => (r + 90) % 360);
    setPan({ x: 0, y: 0 });
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setRotation(0);
  };

  // Dimensions computation
  const isRotated = rotation === 90 || rotation === 270;
  const naturalW = naturalSize ? (isRotated ? naturalSize.height : naturalSize.width) : 1;
  const naturalH = naturalSize ? (isRotated ? naturalSize.width : naturalSize.height) : 1;
  const naturalRatio = naturalW / naturalH;

  const currentOption = RATIO_OPTIONS.find((o) => o.key === selectedRatioKey)!;
  const effectiveRatio = currentOption.ratio ?? naturalRatio;

  // Viewport Stage sizing
  const STAGE_MAX_W = 500;
  const STAGE_MAX_H = 320;
  let frameW = STAGE_MAX_W;
  let frameH = Math.round(frameW / effectiveRatio);
  if (frameH > STAGE_MAX_H) {
    frameH = STAGE_MAX_H;
    frameW = Math.round(frameH * effectiveRatio);
  }

  // Base scale so image fills the crop frame
  const baseScale = Math.max(frameW / naturalW, frameH / naturalH);
  const currentScale = baseScale * zoom;

  // Max pan limits to keep image within or near frame
  const dispW = naturalW * currentScale;
  const dispH = naturalH * currentScale;
  const maxPanX = Math.max(0, (dispW - frameW) / 2);
  const maxPanY = Math.max(0, (dispH - frameH) / 2);

  // Mouse pan handlers
  const onMouseDown = (e: ReactMouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, startPanX: pan.x, startPanY: pan.y });
  };

  const onMouseMove = (e: ReactMouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const newX = Math.min(maxPanX, Math.max(-maxPanX, dragStart.startPanX + dx));
    const newY = Math.min(maxPanY, Math.max(-maxPanY, dragStart.startPanY + dy));
    setPan({ x: newX, y: newY });
  };

  const onMouseUp = () => {
    setIsDragging(false);
  };

  // Touch pan handlers
  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY, startPanX: pan.x, startPanY: pan.y });
    }
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - dragStart.x;
    const dy = e.touches[0].clientY - dragStart.y;
    const newX = Math.min(maxPanX, Math.max(-maxPanX, dragStart.startPanX + dx));
    const newY = Math.min(maxPanY, Math.max(-maxPanY, dragStart.startPanY + dy));
    setPan({ x: newX, y: newY });
  };

  const onTouchEnd = () => {
    setIsDragging(false);
  };

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    setZoom((z) => Math.min(3, Math.max(1, +(z + delta).toFixed(2))));
  };

  // Generate cropped output canvas
  const handleApply = () => {
    if (!naturalSize || !imgRef.current) return;

    let targetW = currentOption.exportWidth;
    let targetH = currentOption.exportHeight;

    if (selectedRatioKey === 'original') {
      const origEffW = isRotated ? naturalSize.height : naturalSize.width;
      const origEffH = isRotated ? naturalSize.width : naturalSize.height;
      if (origEffW < 1080) {
        targetW = 1080;
        targetH = Math.round(1080 * (origEffH / origEffW));
      } else {
        targetW = Math.min(1440, origEffW);
        targetH = Math.round(targetW * (origEffH / origEffW));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // High quality scaling
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // White background for transparent images
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, targetW, targetH);

    // Coordinate mapping from UI frame to Export canvas
    const scaleUp = targetW / frameW;

    ctx.save();
    // Center of canvas + pan
    ctx.translate(targetW / 2 + pan.x * scaleUp, targetH / 2 + pan.y * scaleUp);
    ctx.rotate((rotation * Math.PI) / 180);
    const canvasDrawScale = baseScale * zoom * scaleUp;
    ctx.scale(canvasDrawScale, canvasDrawScale);
    ctx.drawImage(imgRef.current, -naturalSize.width / 2, -naturalSize.height / 2);
    ctx.restore();

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const cleanName = file.name.replace(/\.[^.]+$/, '') + '-crop.jpg';
        const croppedFile = new File([blob], cleanName, { type: 'image/jpeg' });
        onApply({ file: croppedFile, width: targetW, height: targetH });
      },
      'image/jpeg',
      0.92,
    );
  };

  // Handle Use Original (safely upscales if natural size is < 320px)
  const handleOriginalDirect = () => {
    if (naturalSize && (naturalSize.width < 320 || naturalSize.height < 320)) {
      // Upscale cleanly to 1080px to prevent Meta rejection
      const canvas = document.createElement('canvas');
      const scale = Math.max(1080 / naturalSize.width, 1);
      const targetW = 1080;
      const targetH = Math.round(naturalSize.height * scale);
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx && imgRef.current) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, targetW, targetH);
        ctx.drawImage(imgRef.current, 0, 0, targetW, targetH);
        canvas.toBlob(
          (blob) => {
            if (!blob) return onUseOriginal(file);
            const safeFile = new File([blob], file.name.replace(/\.[^.]+$/, '') + '-1080.jpg', { type: 'image/jpeg' });
            onApply({ file: safeFile, width: targetW, height: targetH });
          },
          'image/jpeg',
          0.92,
        );
        return;
      }
    }
    onUseOriginal(file);
  };

  // Guidance messages
  const isIg = targets.includes('instagram');
  const showFeedRatioWarning = isIg && (kind === 'post' || kind === 'carousel') && (effectiveRatio < 0.795 || effectiveRatio > 1.915);

  return (
    <div className="cr-crop-backdrop" onClick={onCancel} role="dialog" aria-modal="true">
      <div className="cr-crop-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="cr-crop-head">
          <div className="cr-crop-head-text">
            <h3>
              <span className="material-icons">crop</span>
              Crop &amp; Adjust Image
            </h3>
            <p>Adjust your photo to Instagram and Facebook required dimensions</p>
          </div>
          <button type="button" className="cr-crop-close" onClick={onCancel} aria-label="Close dialog">
            <span className="material-icons">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="cr-crop-body">
          {/* Ratio presets */}
          <div className="cr-crop-ratios" role="radiogroup" aria-label="Aspect ratio selection">
            {RATIO_OPTIONS.map((opt) => {
              const active = selectedRatioKey === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`cr-crop-ratio-btn${active ? ' active' : ''}`}
                  onClick={() => handleRatioChange(opt.key)}
                  role="radio"
                  aria-checked={active}
                >
                  <span
                    className="cr-crop-ratio-shape"
                    style={{ width: `${opt.shapeWidth}px`, height: `${opt.shapeHeight}px` }}
                    aria-hidden="true"
                  />
                  <strong>{opt.label}</strong>
                  <span className="cr-sub">{opt.sub}</span>
                </button>
              );
            })}
          </div>

          {/* Interactive Crop Viewport */}
          <div
            className="cr-crop-stage"
            ref={stageRef}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
          >
            <div
              className={`cr-crop-frame${isDragging ? ' dragging' : ''}`}
              style={{ width: `${frameW}px`, height: `${frameH}px` }}
              onMouseDown={onMouseDown}
              onTouchStart={onTouchStart}
            >
              {/* Image transform wrap */}
              <div
                className="cr-crop-img-wrap"
                style={{
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotation}deg) scale(${currentScale})`,
                }}
              >
                {imageSrc && (
                  <img
                    ref={imgRef}
                    src={imageSrc}
                    alt=""
                    style={{
                      width: naturalSize ? `${naturalSize.width}px` : 'auto',
                      height: naturalSize ? `${naturalSize.height}px` : 'auto',
                    }}
                  />
                )}
              </div>

              {/* 3x3 Composition grid */}
              <div className="cr-crop-grid" aria-hidden="true">
                <div /><div /><div />
                <div /><div /><div />
                <div /><div /><div />
              </div>
            </div>
          </div>

          {/* Toolbar: Zoom + Rotate + Reset */}
          <div className="cr-crop-tools">
            <div className="cr-crop-zoom-group">
              <button
                type="button"
                className="cr-crop-tool-btn"
                onClick={() => setZoom((z) => Math.max(1, +(z - 0.2).toFixed(2)))}
                title="Zoom Out"
              >
                <span className="material-icons">zoom_out</span>
              </button>
              <input
                type="range"
                className="cr-crop-zoom-slider"
                min="1"
                max="3"
                step="0.05"
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label="Zoom level"
              />
              <button
                type="button"
                className="cr-crop-tool-btn"
                onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}
                title="Zoom In"
              >
                <span className="material-icons">zoom_in</span>
              </button>
              <span className="cr-crop-zoom-pct">{Math.round(zoom * 100)}%</span>
            </div>

            <div className="cr-crop-actions-group">
              <button type="button" className="cr-crop-tool-btn" onClick={handleRotate} title="Rotate 90 degrees">
                <span className="material-icons">rotate_right</span>
              </button>
              <button type="button" className="cr-crop-tool-btn" onClick={handleReset} title="Reset Position & Zoom">
                <span className="material-icons">restart_alt</span>
              </button>
            </div>
          </div>

          {/* Ratio Advice / Warning */}
          {showFeedRatioWarning ? (
            <div className="cr-crop-advice warn">
              <span className="material-icons">warning</span>
              <div>
                <strong>Instagram feed limit:</strong> Instagram requires aspect ratios between 4:5 and 1.91:1. Select <strong>1:1</strong> or <strong>4:5</strong> above to avoid publishing errors.
              </div>
            </div>
          ) : selectedRatioKey === '4:5' ? (
            <div className="cr-crop-advice info">
              <span className="material-icons">auto_awesome</span>
              <div>
                <strong>4:5 Portrait:</strong> Covers maximum vertical screen height on mobile Instagram feeds (1080×1350 px).
              </div>
            </div>
          ) : selectedRatioKey === '1:1' ? (
            <div className="cr-crop-advice info">
              <span className="material-icons">check_circle</span>
              <div>
                <strong>1:1 Square:</strong> The standard format for Instagram &amp; Facebook feed posts (1080×1080 px).
              </div>
            </div>
          ) : selectedRatioKey === '9:16' ? (
            <div className="cr-crop-advice info">
              <span className="material-icons">smartphone</span>
              <div>
                <strong>9:16 Full Screen:</strong> The official ratio for Instagram Stories &amp; Reels (1080×1920 px).
              </div>
            </div>
          ) : (
            <div className="cr-crop-advice info">
              <span className="material-icons">photo_size_select_actual</span>
              <div>
                <strong>High Resolution:</strong> Image will be exported at &ge;1080px wide to satisfy Meta&apos;s 320px minimum requirement.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cr-crop-foot">
          <div className="cr-crop-foot-left">
            <button type="button" className="k-btn ghost" onClick={onCancel}>
              Cancel
            </button>
          </div>
          <div className="cr-crop-foot-right">
            <button
              type="button"
              className="k-btn ghost"
              onClick={handleOriginalDirect}
              title="Upload the original image without cropping"
            >
              Use Original
            </button>
            <button type="button" className="k-btn" onClick={handleApply}>
              <span className="material-icons" style={{ fontSize: '18px' }}>check</span>
              Apply &amp; Upload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

