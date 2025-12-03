import React, { useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button, Card, useToast } from '@/components/shared';
import { apiClient, getImageUrl } from '@/api/client';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CutoutResponse {
  foreground_url: string;
  background_url: string;
}

export const ObjectCutoutDemo: React.FC = () => {
  const { show } = useToast();
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  // 与 SlidePreview 的区域选图交互对齐
  const [isRegionSelectionMode, setIsRegionSelectionMode] = useState(false);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<Rect | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [fgUrl, setFgUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [objPos, setObjPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [isDraggingObj, setIsDraggingObj] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!imageUrl || !overlayRef.current) return;
    // 载入图片仅用于尺寸控制，实际绘制由 <img> 完成
    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      imageRef.current = img;
    };
  }, [imageUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFgUrl(null);
    setBgUrl(null);
    setSelectionRect(null);
    const url = URL.createObjectURL(f);
    setImageUrl(url);
  };

  // 与 SlidePreview 的 handleSelectionXXX 保持行为一致
  const handleSelectionMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;
    setIsSelectingRegion(true);
    setSelectionStart({ x, y });
    setSelectionRect(null);
  };

  const handleSelectionMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionStart || !imageRef.current) return;
    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const clampedX = Math.max(0, Math.min(x, rect.width));
    const clampedY = Math.max(0, Math.min(y, rect.height));

    const left = Math.min(selectionStart.x, clampedX);
    const top = Math.min(selectionStart.y, clampedY);
    const width = Math.abs(clampedX - selectionStart.x);
    const height = Math.abs(clampedY - selectionStart.y);

    setSelectionRect({ x: left, y: top, width, height });
  };

  const handleSelectionMouseUp = () => {
    if (!isRegionSelectionMode || !isSelectingRegion || !selectionStart || !imageRef.current) {
      setIsSelectingRegion(false);
      setSelectionStart(null);
      return;
    }
    // 结束拖拽，但保留选中的矩形，直到用户手动退出区域选图模式
    setIsSelectingRegion(false);
    setSelectionStart(null);
  };

  const handleSmartCut = async () => {
    if (!file || !selectionRect || !imageRef.current) {
      show({ message: '请先上传图片并框选区域', type: 'error' });
      return;
    }
    const imgRect = imageRef.current.getBoundingClientRect();
    try {
      setIsLoading(true);
      // selectionRect 是相对于渲染尺寸的，需要按比例换算到图片原始尺寸
      const naturalWidth = imageRef.current.naturalWidth;
      const naturalHeight = imageRef.current.naturalHeight;
      const scaleX = naturalWidth / imgRect.width;
      const scaleY = naturalHeight / imgRect.height;

      const rectForApi: Rect = {
        x: Math.round(selectionRect.x * scaleX),
        y: Math.round(selectionRect.y * scaleY),
        width: Math.round(selectionRect.width * scaleX),
        height: Math.round(selectionRect.height * scaleY),
      };

      const formData = new FormData();
      formData.append('image', file);
      formData.append('rect', JSON.stringify(rectForApi));
      const res = await apiClient.post<{ success?: boolean; data?: CutoutResponse; error?: string }>(
        '/api/tools/object-cutout',
        formData
      );
      if (!res.data.success || !res.data.data) {
        throw new Error(res.data.error || '智能抓取失败');
      }
      const fg = getImageUrl(res.data.data.foreground_url);
      const bg = getImageUrl(res.data.data.background_url);
      setFgUrl(fg);
      setBgUrl(bg);
      setObjPos({ x: 80, y: 80 });
      show({ message: '智能抓取完成，可以在右侧画布拖拽前景', type: 'success' });
    } catch (err: any) {
      console.error(err);
      show({ message: err.message || '智能抓取失败', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleObjMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    setIsDraggingObj(true);
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingObj || !overlayRef.current) return;
    const rect = overlayRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setObjPos({ x: x - 40, y: y - 40 });
  };

  const handleOverlayMouseUp = () => {
    setIsDraggingObj(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex flex-col items-center py-10">
      <h1 className="text-3xl font-bold mb-2">🧪 SAM 智能抠图 Demo（隐藏页面）</h1>
      <p className="text-sm text-slate-400 mb-6">
        上传一张图片，在左侧画布中框选矩形区域，点击智能抓取后，后端使用 SAM 分割主体并用 inpaint 修复背景，右侧可以拖拽抠出的前景。
      </p>

      <div className="flex gap-6 max-w-6xl w-full px-6">
        <Card className="flex-1 p-4 bg-slate-900 border-slate-800">
          <h2 className="text-lg font-semibold mb-3">原图与矩形框选</h2>
          <div className="flex items-center gap-3 mb-4">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="text-sm text-slate-200"
            />
            <button
              onClick={() => {
                if (!imageUrl) return;
                setIsRegionSelectionMode((prev) => !prev);
                // 切模式时清空当前选区
                setSelectionStart(null);
                setSelectionRect(null);
                setIsSelectingRegion(false);
              }}
              className="px-3 py-1 rounded bg-white/80 text-xs text-gray-800 hover:bg-banana-50 shadow-sm flex items-center gap-1"
            >
              <Sparkles size={14} />
              <span>{isRegionSelectionMode ? '结束框选' : '开始框选'}</span>
            </button>
            <Button
              size="sm"
              onClick={handleSmartCut}
              loading={isLoading}
              disabled={!selectionRect || !file}
            >
              智能抓取
            </Button>
          </div>
          <div className="relative border border-slate-700 rounded-md overflow-hidden bg-slate-950">
            {imageUrl ? (
              <div
                className="relative w-full max-h-[480px] flex items-center justify-center bg-black/40"
                onMouseDown={handleSelectionMouseDown}
                onMouseMove={handleSelectionMouseMove}
                onMouseUp={handleSelectionMouseUp}
                onMouseLeave={handleSelectionMouseUp}
              >
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt="source"
                  className="max-w-full max-h-[480px] object-contain select-none"
                  draggable={false}
                />
                {selectionRect && (
                  <div
                    className="absolute border-2 border-banana-500 bg-banana-400/10 pointer-events-none"
                    style={{
                      left: selectionRect.x,
                      top: selectionRect.y,
                      width: selectionRect.width,
                      height: selectionRect.height,
                    }}
                  />
                )}
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
                请先上传图片
              </div>
            )}
          </div>
        </Card>

        <Card className="flex-1 p-4 bg-slate-900 border-slate-800">
          <h2 className="text-lg font-semibold mb-3">智能抠图画布（可拖拽前景）</h2>
          {!bgUrl ? (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">
              完成智能抓取后，这里会出现修复后的背景和可拖拽的前景。
            </div>
          ) : (
            <div
              ref={overlayRef}
              className="relative w-full max-w-[640px] border border-slate-700 rounded-md overflow-hidden"
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
              onMouseLeave={handleOverlayMouseUp}
            >
              <img src={bgUrl} alt="background" className="w-full block select-none pointer-events-none" />
              {fgUrl && (
                <img
                  src={fgUrl}
                  alt="foreground"
                  style={{
                    position: 'absolute',
                    left: objPos.x,
                    top: objPos.y,
                    width: 160,
                    cursor: 'grab',
                  }}
                  onMouseDown={handleObjMouseDown}
                  draggable={false}
                />
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};


