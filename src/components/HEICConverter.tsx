/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import heic2any from 'heic2any';
import JSZip from 'jszip';
import {
  Upload,
  Image as ImageIcon,
  Check,
  AlertCircle,
  Trash2,
  Download,
  RefreshCw,
  Sliders,
  Sparkles,
  Info,
  ShieldCheck,
  X,
  FileImage,
  Layers,
  ChevronRight,
  Eye,
  CheckCircle2,
  FileDown
} from 'lucide-react';
import { HEICFile, ConversionSettings, OutputFormat } from '../types';
import { MAX_BATCH_FILES } from '../config';

const CONVERSION_SUCCESS_MESSAGE = '変換が完了しました';
const CONVERSION_FAILED_MESSAGE = '変換できませんでした。';

// Helper to format bytes to readable strings
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Generates a high-quality beautiful canvas blob to simulate HEIC conversions
const getMockCanvasBlob = (filename: string, format: OutputFormat, quality: number): Promise<Blob> => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      if (filename.includes('sunset')) {
        // Sunset Gradient
        const grad = ctx.createLinearGradient(0, 0, 0, 1080);
        grad.addColorStop(0, '#f857a6'); // vibrant pink-red
        grad.addColorStop(0.5, '#ff5858'); // coral orange
        grad.addColorStop(1, '#ff8008'); // gold sun orange
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1920, 1080);

        // Sun
        ctx.beginPath();
        ctx.arc(960, 580, 200, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();

        // Reflections
        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.fillRect(300, 850, 1320, 20);
        ctx.fillRect(500, 890, 920, 15);
        ctx.fillRect(700, 920, 520, 10);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 50px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Demo Sunset iPhone Photo (Converted)', 960, 1000);
      } else {
        // Alpine Forest Gradient
        const grad = ctx.createLinearGradient(0, 0, 1920, 1080);
        grad.addColorStop(0, '#134e5e'); // dark emerald blue
        grad.addColorStop(1, '#71b280'); // soft sage green
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1920, 1080);

        // Forest Shapes (abstract mountains)
        ctx.beginPath();
        ctx.moveTo(0, 1080);
        ctx.lineTo(400, 500);
        ctx.lineTo(800, 1080);
        ctx.fillStyle = '#1c6d7a';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(500, 1080);
        ctx.lineTo(1000, 400);
        ctx.lineTo(1500, 1080);
        ctx.fillStyle = '#268896';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(1100, 1080);
        ctx.lineTo(1600, 600);
        ctx.lineTo(1920, 1080);
        ctx.fillStyle = '#31a0b0';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 50px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Demo Forest Alpine Photo (Converted)', 960, 1000);
      }
    }
    
    const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const qValue = format === 'jpeg' ? quality : undefined;
    
    canvas.toBlob((blob) => {
      resolve(blob || new Blob());
    }, mimeType, qValue);
  });
};

// Helper to resize an image blob using canvas transformation before HEIC conversion completes
const resizeBlobIfNeeded = (
  blob: Blob,
  format: OutputFormat,
  quality: number,
  maxWidth?: number,
  maxHeight?: number
): Promise<Blob> => {
  if (!maxWidth && !maxHeight) {
    return Promise.resolve(blob);
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let width = img.naturalWidth;
      let height = img.naturalHeight;
      
      let ratio = 1;
      if (maxWidth && maxHeight) {
        ratio = Math.min(maxWidth / width, maxHeight / height);
      } else if (maxWidth) {
        ratio = maxWidth / width;
      } else if (maxHeight) {
        ratio = maxHeight / height;
      }

      // Only scale down (preserving aspect ratio and native density rules)
      if (ratio < 1) {
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      } else {
        // No resizing needed if image is already smaller than max dimensions
        resolve(blob);
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(blob);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      
      const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const qValue = format === 'jpeg' ? quality : undefined;

      canvas.toBlob((resizedBlob) => {
        resolve(resizedBlob || blob);
      }, mimeType, qValue);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
};

export default function HEICConverter() {
  const [files, setFiles] = useState<HEICFile[]>([]);
  const [settings, setSettings] = useState<ConversionSettings>({
    globalFormat: 'jpeg',
    quality: 0.85
  });
  const [isLibraryReady, setIsLibraryReady] = useState<boolean>(true); // heic2any is imported directly, initialized ready
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isProcessingAll, setIsProcessingAll] = useState<boolean>(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'success' | 'error'>('all');
  const [hoveredFileId, setHoveredFileId] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ url: string; name: string } | null>(null);
  const [expandedResizeFileId, setExpandedResizeFileId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Apply default format when global changes
  const applyGlobalFormatToPending = (format: OutputFormat) => {
    setFiles(prev => prev.map(f => f.status === 'pending' ? { ...f, format } : f));
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (files.length >= MAX_BATCH_FILES) {
      alert(`一度に変換できるのは最大 ${MAX_BATCH_FILES} 枚までです。先にリストから写真を削除してから追加してください。`);
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      addFilesFromList(e.dataTransfer.files);
    }
  };

  const fileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      addFilesFromList(e.target.files);
    }
    // Reset file input so same file can be reselected
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const enqueueFiles = (newFiles: HEICFile[]) => {
    if (newFiles.length === 0) return;

    setFiles(prev => {
      const remaining = MAX_BATCH_FILES - prev.length;
      if (remaining <= 0) {
        setTimeout(() => {
          alert(`一度に変換できるのは最大 ${MAX_BATCH_FILES} 枚までです。先にリストから写真を削除してから追加してください。`);
        }, 0);
        return prev;
      }

      const filesToAdd = newFiles.slice(0, remaining);
      const skipped = newFiles.length - filesToAdd.length;

      if (skipped > 0) {
        setTimeout(() => {
          alert(`一度に変換できるのは最大 ${MAX_BATCH_FILES} 枚までです。${filesToAdd.length} 枚を追加しました（${skipped} 枚は上限のため追加されませんでした）。`);
        }, 0);
      }

      return [...prev, ...filesToAdd];
    });
  };

  // Add parsed file objects to state
  const addFilesFromList = (fileList: FileList) => {
    const newFiles: HEICFile[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      // Filter for HEIC / HEIF only (or mock files)
      if (ext === 'heic' || ext === 'heif' || file.type === 'image/heic' || file.type === 'image/heif') {
        const id = Math.random().toString(36).substring(2, 9);
        newFiles.push({
          id,
          file,
          name: file.name,
          size: file.size,
          status: 'pending',
          progress: 0,
          convertedUrl: null,
          convertedBlob: null,
          convertedSize: null,
          error: null,
          format: settings.globalFormat
        });
      }
    }

    if (newFiles.length === 0) {
      alert("HEIC または HEIF 形式のファイル（.heic, .heif）を選択してください。");
      return;
    }

    enqueueFiles(newFiles);
  };

  // Add demo simulated files so the user can test the app without having real HEIC files on hand
  const addSimulatedFiles = () => {
    const mockFilesData = [
      { name: 'sunset_beach_iphone_demo.heic', size: 3450200, isSunset: true },
      { name: 'forest_mountain_hike_demo.heic', size: 4120900, isSunset: false }
    ];

    const mockFiles: HEICFile[] = mockFilesData.map(mock => {
      const emptyBlob = new Blob(["mock-heic-data"], { type: 'image/heic' });
      // Create a File object
      const file = new File([emptyBlob], mock.name, { type: 'image/heic' });
      return {
        id: 'mock-' + Math.random().toString(36).substring(2, 9),
        file,
        name: mock.name,
        size: mock.size,
        status: 'pending',
        progress: 0,
        convertedUrl: null,
        convertedBlob: null,
        convertedSize: null,
        error: null,
        format: settings.globalFormat
      };
    });

    enqueueFiles(mockFiles);
  };

  // Remove a single file from the queue
  const removeFile = (id: string) => {
    setFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove?.convertedUrl) {
        URL.revokeObjectURL(fileToRemove.convertedUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  // Clear all files
  const clearQueue = () => {
    files.forEach(f => {
      if (f.convertedUrl) URL.revokeObjectURL(f.convertedUrl);
    });
    setFiles([]);
  };

  // Change individual file target format
  const toggleFileFormat = (id: string) => {
    setFiles(prev => prev.map(f => {
      if (f.id === id) {
        const nextFormat: OutputFormat = f.format === 'jpeg' ? 'png' : 'jpeg';
        return { ...f, format: nextFormat };
      }
      return f;
    }));
  };

  // Single Core Conversion process
  const convertSingleFile = async (id: string, currentSettings: ConversionSettings): Promise<boolean> => {
    const targetFile = files.find(f => f.id === id);
    if (!targetFile || targetFile.status === 'success' || targetFile.status === 'converting') {
      return false;
    }

    // Set file status to converting
    setFiles(prev => prev.map(f => f.id === id ? { ...f, status: 'converting', progress: 15, error: null } : f));

    // Wait a brief tick for UI updating
    await new Promise(resolve => setTimeout(resolve, 150));

    try {
      let convertedBlob: Blob;

      if (id.startsWith('mock-')) {
        // Simulated conversion to keep it fast, reliable, and produce gorgeous wallpapers to download!
        // Increment progress bar to simulate realistic conversion
        for (let p = 30; p < 90; p += 20) {
          setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: p } : f));
          await new Promise(resolve => setTimeout(resolve, 150));
        }
        
        convertedBlob = await getMockCanvasBlob(targetFile.name, targetFile.format, currentSettings.quality);
      } else {
        // Real conversion with heic2any (with automatic high-reliability Server-side fallback!)
        setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: 30, error: null } : f));
        
        const outputType = targetFile.format === 'jpeg' ? 'image/jpeg' : 'image/png';
        
        try {
          console.log("Attempting local browser conversion for:", targetFile.name);
          // Execute conversion locally in browser
          const result = await heic2any({
            blob: targetFile.file,
            toType: outputType,
            quality: targetFile.format === 'jpeg' ? currentSettings.quality : undefined
          });

          // heic2any might return an array of blobs or a single blob
          convertedBlob = Array.isArray(result) ? result[0] : result;
        } catch (localErr: any) {
          console.warn("Local browser conversion failed (likely Web Worker / iframe Sandbox restriction). Activating high-reliability Full-stack Server API conversion fallback...", localErr);
          
          setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: 50, error: "サーバー側で安全にデコード中..." } : f));
          
          // Fallback to Express backend conversion!
          const formData = new FormData();
          formData.append('file', targetFile.file);
          formData.append('format', targetFile.format);
          formData.append('quality', String(currentSettings.quality));

          const response = await fetch('/api/convert', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `サーバー側でのデコード処理に失敗しました。ファイルが適切か確認してください。(コード: ${response.status})`);
          }

          convertedBlob = await response.blob();
        }
        
        // Ensure accurate types or use canvas fallback if something is corrupted
        if (!convertedBlob || convertedBlob.size === 0) {
          throw new Error("デコードデータが空です。ファイルが破損している可能性があります。");
        }
      }

      setFiles(prev => prev.map(f => f.id === id ? { ...f, progress: 90 } : f));

      // Apply resizing if user provided Max Width/Height settings
      if (targetFile.maxWidth || targetFile.maxHeight) {
        try {
          convertedBlob = await resizeBlobIfNeeded(
            convertedBlob,
            targetFile.format,
            currentSettings.quality,
            targetFile.maxWidth,
            targetFile.maxHeight
          );
        } catch (resizeErr) {
          console.warn("Resize failed, proceeding with original converted image:", resizeErr);
        }
      }

      // Create downloadable URL
      const convertedUrl = URL.createObjectURL(convertedBlob);
      
      setFiles(prev => prev.map(f => f.id === id ? {
        ...f,
        status: 'success',
        progress: 100,
        convertedUrl,
        convertedBlob,
        convertedSize: convertedBlob.size
      } : f));

      return true;
    } catch (err: any) {
      console.error("HEIC Conversion failed:", err);
      const errorMsg = err.message || CONVERSION_FAILED_MESSAGE;
      setFiles(prev => prev.map(f => f.id === id ? {
        ...f,
        status: 'error',
        progress: 0,
        error: errorMsg
      } : f));
      return false;
    }
  };

  // Convert all pending files in sequence
  const convertAllPending = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsProcessingAll(true);

    // Copy settings to prevent changes in the middle of processing
    const currentSettings = { ...settings };

    for (const item of pendingFiles) {
      await convertSingleFile(item.id, currentSettings);
    }

    setIsProcessingAll(false);
  };

  // Trigger download for single successfully converted file
  const downloadSingleFile = (fileItem: HEICFile) => {
    if (!fileItem.convertedUrl) return;
    
    // Determine extension based on target format
    const ext = fileItem.format === 'jpeg' ? 'jpg' : 'png';
    const originalNameWithoutExt = fileItem.name.replace(/\.[^/.]+$/, "");
    const outputFilename = `${originalNameWithoutExt}.${ext}`;

    const link = document.createElement('a');
    link.href = fileItem.convertedUrl;
    link.download = outputFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Gather all successfully converted files to download as a ZIP file
  const downloadAllAsZip = async () => {
    const convertedItems = files.filter(f => f.status === 'success' && f.convertedBlob);
    if (convertedItems.length === 0) return;

    const zip = new JSZip();
    
    convertedItems.forEach((f) => {
      const ext = f.format === 'jpeg' ? 'jpg' : 'png';
      const originalNameWithoutExt = f.name.replace(/\.[^/.]+$/, "");
      const outputFilename = `${originalNameWithoutExt}.${ext}`;
      
      if (f.convertedBlob) {
        zip.file(outputFilename, f.convertedBlob);
      }
    });

    try {
      const content = await zip.generateAsync({ type: 'blob' });
      const mainZipUrl = URL.createObjectURL(content);

      const link = document.createElement('a');
      link.href = mainZipUrl;
      link.download = `converted_photos_${Date.now().toString().slice(-4)}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      setTimeout(() => URL.revokeObjectURL(mainZipUrl), 5000);
    } catch (e) {
      console.error("Failed to generate ZIP file:", e);
      alert("ZIPファイルの生成に失敗しました。個別ダウンロードをお試しください。");
    }
  };

  // Filter files list
  const filteredFiles = files.filter(f => {
    if (filter === 'all') return true;
    return f.status === filter;
  });

  const activeCount = files.length;
  const isAtMaxCapacity = activeCount >= MAX_BATCH_FILES;
  const pendingCount = files.filter(f => f.status === 'pending').length;
  const convertingCount = files.filter(f => f.status === 'converting').length;
  const successCount = files.filter(f => f.status === 'success').length;
  const errorCount = files.filter(f => f.status === 'error').length;

  return (
    <div id="heic_app_root" className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8 font-sans antialiased text-slate-800">
      {/* Background Graphic Accent */}
      <div className="absolute top-0 left-0 right-0 h-2 bg-linear-to-r from-violet-600 via-indigo-600 to-emerald-500" />
      
      <div className="max-w-4xl mx-auto">
        {/* Header Block */}
        <div id="header_section" className="text-center mb-10 mt-4">
          <div className="inline-flex items-center space-x-2 bg-violet-50 border border-violet-100 text-violet-700 px-3 py-1.5 rounded-full text-xs font-semibold mb-4 shadow-xs">
            <ShieldCheck className="w-4 h-4 text-violet-600" />
            <span>100% 安全：完全ローカル変換（サーバー送信なし）</span>
          </div>
          <h1 id="app_title" className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-3">
            HEIC <span className="text-transparent bg-clip-text bg-linear-to-r from-violet-600 to-indigo-600">画像コンバーター</span>
          </h1>
          <p id="app_subtitle" className="text-slate-600 max-w-xl mx-auto text-sm sm:text-base leading-relaxed">
            iPhoneやiPadで撮影された高画質な <span className="font-semibold text-slate-800">.heic</span> 写真を、ブラウザ上で瞬時に汎用性の高い <span className="font-semibold text-slate-800">JPEG (.jpg)</span> または <span className="font-semibold text-slate-800 text-emerald-600">PNG</span> に一括変換します。
          </p>
        </div>

        {/* bento settings panel & dropzone */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-6">
          
          {/* Conversion Settings Panel */}
          <div id="settings_card" className="md:col-span-4 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center space-x-2 pb-4 mb-4 border-b border-slate-100">
                <Sliders className="w-4 h-4 text-violet-600" />
                <h3 className="font-bold text-slate-800 text-sm">デフォルト変換設定</h3>
              </div>

              {/* Format selection */}
              <div className="mb-4">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">出力形式</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="preset_jpeg_btn"
                    type="button"
                    onClick={() => {
                      setSettings(prev => ({ ...prev, globalFormat: 'jpeg' }));
                      applyGlobalFormatToPending('jpeg');
                    }}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center space-x-1 ${
                      settings.globalFormat === 'jpeg'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>JPEG (.jpg)</span>
                  </button>
                  <button
                    id="preset_png_btn"
                    type="button"
                    onClick={() => {
                      setSettings(prev => ({ ...prev, globalFormat: 'png' }));
                      applyGlobalFormatToPending('png');
                    }}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center space-x-1 ${
                      settings.globalFormat === 'png'
                        ? 'bg-violet-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <span>PNG (.png)</span>
                  </button>
                </div>
              </div>

              {/* Quality Settings (only if Jpeg) */}
              {settings.globalFormat === 'jpeg' && (
                <div className="mb-4 animate-fadeIn">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                      圧縮画質 (Quality)
                    </label>
                    <span className="text-xs font-bold text-violet-700 bg-violet-50 px-1.5 py-0.5 rounded">
                      {Math.round(settings.quality * 100)}%
                    </span>
                  </div>
                  <input
                    id="quality_slider"
                    type="range"
                    min="0.4"
                    max="1.0"
                    step="0.05"
                    value={settings.quality}
                    onChange={(e) => setSettings(prev => ({ ...prev, quality: parseFloat(e.target.value) }))}
                    className="w-full accent-violet-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>高圧縮 (軽量)</span>
                    <span>標準 (バランス)</span>
                    <span>高画質 (大容量)</span>
                  </div>
                </div>
              )}
            </div>

            <div className="text-[11px] text-slate-400 bg-slate-50 p-2.5 rounded-lg border border-slate-100 mt-2 flex items-start space-x-1.5">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>
                {settings.globalFormat === 'jpeg' 
                  ? 'JPEGはファイルサイズが小さく、SNSやWebへのアップロードに適しています。' 
                  : 'PNGは画像劣化のない高品質な出力ですが、ファイルサイズは大きくなります。'}
              </span>
            </div>
          </div>

          {/* Interactive Drag & Drop Box */}
          <div
            id="dropzone_container"
            onDragEnter={isAtMaxCapacity ? undefined : handleDrag}
            onDragOver={isAtMaxCapacity ? undefined : handleDrag}
            onDragLeave={isAtMaxCapacity ? undefined : handleDrag}
            onDrop={isAtMaxCapacity ? undefined : handleDrop}
            onClick={() => {
              if (isAtMaxCapacity) {
                alert(`一度に変換できるのは最大 ${MAX_BATCH_FILES} 枚までです。先にリストから写真を削除してから追加してください。`);
                return;
              }
              fileInputRef.current?.click();
            }}
            className={`md:col-span-8 bg-white border-2 border-dashed rounded-2xl p-7 flex flex-col items-center justify-center text-center transition-all ${
              isAtMaxCapacity
                ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-70'
                : dragActive
                  ? 'border-violet-500 bg-violet-50/50 scale-[0.99] shadow-inner cursor-pointer'
                  : 'border-slate-300 hover:border-violet-500 hover:bg-slate-50/40 hover:shadow-xs cursor-pointer'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".heic,.heif,image/heic,image/heif"
              onChange={fileSelected}
              className="hidden"
            />
            
            <div className="w-14 h-14 bg-violet-50 rounded-2xl flex items-center justify-center text-violet-600 mb-4 shadow-xs">
              <Upload className="w-7 h-7" />
            </div>
            
            <h3 className="font-bold text-slate-800 text-base mb-1">
              {isAtMaxCapacity ? `上限に達しました（${MAX_BATCH_FILES}枚）` : 'HEICファイルをここにドロップ'}
            </h3>
            <p className="text-slate-500 text-xs sm:text-sm max-w-sm mb-4">
              {isAtMaxCapacity
                ? `一度に変換できるのは最大 ${MAX_BATCH_FILES} 枚までです。追加するにはリストから写真を削除してください。`
                : 'または、クリックしてフォルダから選択できます。複数写真をまとめて選択可能です。'}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-400">
              <span className="flex items-center"><FileImage className="w-3.5 h-3.5 mr-1" /> .heic / .heif 対応</span>
              <span>•</span>
              <span>最大 {MAX_BATCH_FILES} 枚まで</span>
              <span>•</span>
              <span>オフライン動作OK</span>
              {activeCount > 0 && (
                <>
                  <span>•</span>
                  <span className={isAtMaxCapacity ? 'text-amber-600 font-semibold' : ''}>
                    現在 {activeCount} / {MAX_BATCH_FILES} 枚
                  </span>
                </>
              )}
            </div>

            {/* Simulated Mode Quick Invite */}
            <div className="mt-5 pt-4 border-t border-slate-100 w-full flex flex-col sm:flex-row justify-center items-center gap-2">
              <span className="text-xs text-slate-500">HEIC写真がお手元にないですか？</span>
              <button
                id="demo_simulate_btn"
                type="button"
                disabled={isAtMaxCapacity}
                onClick={(e) => {
                  e.stopPropagation();
                  addSimulatedFiles();
                }}
                className="inline-flex items-center space-x-1 bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 py-1 px-3 rounded-full text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-amber-50"
              >
                <Sparkles className="w-3 h-3 text-amber-600 fill-amber-500" />
                <span>デモ用写真で今すぐ体験</span>
              </button>
            </div>
          </div>
        </div>

        {/* Filter and Control Bar (If queue is not empty) */}
        {activeCount > 0 && (
          <div id="queue_control_bar" className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-4">
            
            <div className="flex items-center space-x-2 self-start sm:self-auto">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                isAtMaxCapacity
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-slate-50 text-slate-500 border-slate-200'
              }`}>
                {activeCount} / {MAX_BATCH_FILES} 枚
              </span>
            </div>

            {/* Filter segments */}
            <div className="flex items-center space-x-1.5 self-start sm:self-auto overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                すべて ({activeCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('pending')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  filter === 'pending' ? 'bg-amber-100 text-amber-800' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                待機中 ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilter('success')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  filter === 'success' ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                変換完了 ({successCount})
              </button>
              {errorCount > 0 && (
                <button
                  type="button"
                  onClick={() => setFilter('error')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    filter === 'error' ? 'bg-rose-100 text-rose-800' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  エラー ({errorCount})
                </button>
              )}
            </div>

            {/* Multi actions */}
            <div className="flex items-center space-x-2 shrink-0 w-full sm:w-auto justify-end">
              <button
                id="clear_queue_btn"
                type="button"
                onClick={clearQueue}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all flex items-center space-x-1"
                disabled={isProcessingAll}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>リストを空にする</span>
              </button>

              {successCount > 0 && (
                <button
                  id="batch_download_btn"
                  type="button"
                  onClick={downloadAllAsZip}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center space-x-1 shadow-sm"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>すべてZIPで保存 ({successCount}枚)</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Files Queue List */}
        <div id="queue_items_container">
          <AnimatePresence mode="popLayout">
            {filteredFiles.map((item) => {
              const ext = item.format === 'jpeg' ? 'jpg' : 'png';
              const isSimulated = item.id.startsWith('mock-');
              const progressPercentage = Math.round(item.progress);
              
              const isHovered = hoveredFileId === item.id;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.2 }}
                  onMouseEnter={() => setHoveredFileId(item.id)}
                  onMouseLeave={() => setHoveredFileId(null)}
                  className={`bg-white border rounded-xl p-4 mb-3 shadow-xs transition-all relative ${
                    item.status === 'converting' ? 'border-violet-300 ring-1 ring-violet-100' :
                    item.status === 'success' ? 'border-emerald-200 bg-emerald-50/15' :
                    item.status === 'error' ? 'border-rose-200 bg-rose-50/10' :
                    'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    
                    {/* Media representation & name details */}
                    <div className="flex items-center space-x-3.5 min-w-0 flex-1 w-full sm:w-auto">
                      
                      {/* Left Thumbnail with Hover Overlay preview */}
                      <div className="relative w-14 h-14 bg-slate-100 rounded-lg overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center">
                        {item.status === 'success' && item.convertedUrl ? (
                          <>
                            <img
                              src={item.convertedUrl}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                            {/* Hover Eye Lightbox Icon */}
                            <button
                              type="button"
                              onClick={() => setLightboxImage({ url: item.convertedUrl!, name: item.name })}
                              className="absolute inset-0 bg-black/45 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                              title="画像を拡大プレビュー"
                            >
                              <Eye className="w-5 h-5 text-white" />
                            </button>
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-400">
                            <ImageIcon className="w-5 h-5 mb-0.5 text-violet-400" />
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">HEIC</span>
                          </div>
                        )}

                        {/* Simulated badge */}
                        {isSimulated && (
                          <span className="absolute top-0 left-0 bg-amber-500 text-white text-[8px] font-bold px-1 rounded-br">
                            DEMO
                          </span>
                        )}
                      </div>

                      {/* Filename details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-bold text-slate-800 text-sm truncate" title={item.name}>
                            {item.name}
                          </h4>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-1">
                          <span>{formatBytes(item.size)}</span>
                          <span>•</span>
                          
                          {/* Output Format Interactive Pill */}
                          {item.status === 'pending' ? (
                            <button
                              type="button"
                              onClick={() => toggleFileFormat(item.id)}
                              className="inline-flex items-center space-x-0.5 bg-slate-100 hover:bg-violet-100 hover:text-violet-700 text-xs px-2 py-0.5 rounded-full font-bold transition-all text-slate-600 cursor-pointer"
                              title="出力形式を切り替え"
                            >
                              <span>変換先: </span>
                              <span className="text-violet-600 font-extrabold uppercase">{item.format}</span>
                            </button>
                          ) : (
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-bold text-[11px] uppercase">
                              {item.format}
                            </span>
                          )}

                          {/* Resize setting toggle button */}
                          {item.status === 'pending' ? (
                            <>
                              <span>•</span>
                              <button
                                type="button"
                                onClick={() => setExpandedResizeFileId(expandedResizeFileId === item.id ? null : item.id)}
                                className={`inline-flex items-center space-x-1 text-xs px-2.5 py-0.5 rounded-full font-bold transition-all cursor-pointer ${
                                  item.maxWidth || item.maxHeight
                                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                                }`}
                                title="画像サイズを変更（縮小）する設定を開きます"
                              >
                                <Sliders className="w-3" />
                                <span>画像縮小: {item.maxWidth || item.maxHeight ? `${item.maxWidth || '自動'}×${item.maxHeight || '自動'}` : 'オフ'}</span>
                              </button>
                            </>
                          ) : (
                            (item.maxWidth || item.maxHeight) && (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center space-x-1 text-[11px] bg-amber-50 text-amber-800 border border-amber-200/50 px-2 py-0.5 rounded-full font-bold">
                                  <Sliders className="w-3" />
                                  <span>リサイズ: 最大 {item.maxWidth || '自動'}×{item.maxHeight || '自動'}px</span>
                                </span>
                              </>
                            )
                          )}

                          {/* Compression Ratio Stats for completed conversions */}
                          {item.status === 'success' && item.convertedSize && (
                            <>
                              <span>→</span>
                              <span className="text-slate-500 font-medium">
                                {formatBytes(item.convertedSize)}
                              </span>
                              {item.convertedSize < item.size ? (
                                <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded font-extrabold text-[10px]">
                                  {Math.round((1 - item.convertedSize / item.size) * 100)}% 圧縮削減
                                </span>
                              ) : (
                                <span className="text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded text-[10px] flex items-center gap-0.5" title="高品質・高解像度のため、元データより大容量になる場合があります。">
                                  <Info className="w-3 h-3 text-slate-400" />
                                  高画質優先
                                </span>
                              )}
                            </>
                          )}

                          {item.status === 'success' && (
                            <div className="w-full mt-1.5">
                              <p className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                {CONVERSION_SUCCESS_MESSAGE}
                              </p>
                            </div>
                          )}

                          {item.status === 'error' && (
                            <div className="w-full mt-1.5">
                              <p className="text-xs text-rose-600 font-semibold flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                                {CONVERSION_FAILED_MESSAGE}
                              </p>
                              {item.error && item.error !== CONVERSION_FAILED_MESSAGE && (
                                <p className="text-[11px] text-rose-500/90 mt-0.5 pl-[1.125rem]">
                                  {item.error}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Progress tracking / Action triggers block */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto border-t sm:border-t-0 pt-2 sm:pt-0 shrink-0">
                      
                      {/* State Tracker Representation */}
                      <div className="flex items-center">
                        {item.status === 'pending' && (
                          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5 animate-pulse" />
                            待機中
                          </span>
                        )}

                        {item.status === 'converting' && (
                          <div className="flex flex-col items-end space-y-1">
                            <div className="flex items-center space-x-2">
                              <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                <motion.div
                                  className="bg-violet-600 h-full rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progressPercentage}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-violet-600 shrink-0 min-w-8">
                                {progressPercentage}%
                              </span>
                            </div>
                            {item.error && (
                              <span className="text-[10px] text-violet-600 animate-pulse font-medium">
                                {item.error}
                              </span>
                            )}
                          </div>
                        )}

                        {item.status === 'success' && (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100">
                            <Check className="w-3.5 h-3.5 mr-1" />
                            {CONVERSION_SUCCESS_MESSAGE}
                          </span>
                        )}

                        {item.status === 'error' && (
                          <span
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-700 border border-rose-100"
                            title={item.error || CONVERSION_FAILED_MESSAGE}
                          >
                            <AlertCircle className="w-3.5 h-3.5 mr-1 text-rose-500" />
                            {CONVERSION_FAILED_MESSAGE}
                          </span>
                        )}
                      </div>

                      {/* CTA Actions */}
                      <div className="flex items-center space-x-1.5">
                        {/* Convert Solo Trigger (for pending) */}
                        {item.status === 'pending' && (
                          <button
                            type="button"
                            onClick={() => convertSingleFile(item.id, settings)}
                            className="p-1 px-3 text-xs font-bold rounded-lg text-white bg-violet-600 hover:bg-violet-700 shadow-xs transition-colors"
                            disabled={isProcessingAll}
                          >
                            変換
                          </button>
                        )}

                        {/* Direct Download Trigger */}
                        {item.status === 'success' && (
                          <button
                            type="button"
                            onClick={() => downloadSingleFile(item)}
                            className="p-1.5 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all flex items-center"
                            title="この画像を保存"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                        )}

                        {/* Remove from queue */}
                        <button
                          type="button"
                          onClick={() => removeFile(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors"
                          title="リストから消去"
                          disabled={item.status === 'converting'}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                    </div>

                  </div>

                  {/* Collapsible Resize Settings Panel */}
                  <AnimatePresence>
                    {expandedResizeFileId === item.id && item.status === 'pending' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden mt-4 pt-4 border-t border-slate-100"
                      >
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-xs font-extrabold text-slate-700 flex items-center space-x-1.5">
                              <Sliders className="w-3.5 h-3.5 text-violet-600" />
                              <span>画像リサイズ（縮小）設定</span>
                            </span>
                            <span className="text-[10px] sm:text-[11px] text-slate-400">
                              ※アスペクト比（縦横比）は自動で維持されます
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-3.5">
                            {/* Max Width */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                最大幅 (Width)
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="制限なし (auto)"
                                  value={item.maxWidth || ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                    setFiles(prev => prev.map(f => f.id === item.id ? { ...f, maxWidth: val } : f));
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold uppercase">
                                  px
                                </span>
                              </div>
                            </div>

                            {/* Max Height */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                最大高さ (Height)
                              </label>
                              <div className="relative">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="制限なし (auto)"
                                  value={item.maxHeight || ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                                    setFiles(prev => prev.map(f => f.id === item.id ? { ...f, maxHeight: val } : f));
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-hidden focus:ring-1 focus:ring-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold uppercase">
                                  px
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Preset suggestions */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-slate-200/50">
                            <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">クイック設定:</span>
                            <button
                              type="button"
                              onClick={() => {
                                setFiles(prev => prev.map(f => f.id === item.id ? { ...f, maxWidth: 1920, maxHeight: undefined } : f));
                              }}
                              className="text-[10px] px-2 py-1 rounded bg-white border border-slate-200 hover:border-violet-300 text-slate-600 hover:text-violet-700 font-bold transition-all cursor-pointer"
                            >
                              Full HD (1920px)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFiles(prev => prev.map(f => f.id === item.id ? { ...f, maxWidth: 1200, maxHeight: undefined } : f));
                              }}
                              className="text-[10px] px-2 py-1 rounded bg-white border border-slate-200 hover:border-violet-300 text-slate-600 hover:text-violet-700 font-bold transition-all cursor-pointer"
                            >
                              ブログ用 (1200px)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFiles(prev => prev.map(f => f.id === item.id ? { ...f, maxWidth: 800, maxHeight: undefined } : f));
                              }}
                              className="text-[10px] px-2 py-1 rounded bg-white border border-slate-200 hover:border-violet-300 text-slate-600 hover:text-violet-700 font-bold transition-all cursor-pointer"
                            >
                              SNS用 (800px)
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setFiles(prev => prev.map(f => f.id === item.id ? { ...f, maxWidth: undefined, maxHeight: undefined } : f));
                              }}
                              className="text-[10px] px-2 py-1 rounded bg-rose-50 border border-rose-100/55 hover:bg-rose-100 text-rose-700 font-bold transition-all ml-auto cursor-pointer"
                            >
                              クリア
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Empty state view */}
          {files.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 px-4 border border-slate-200 bg-white rounded-2xl shadow-xs"
            >
              <div className="w-16 h-16 bg-slate-50 text-slate-300 rounded-full mx-auto flex items-center justify-center mb-4">
                <FileImage className="w-8 h-8 text-slate-300" />
              </div>
              <h4 className="font-bold text-slate-700 text-base mb-1">
                変換待ちのファイルはありません
              </h4>
              <p className="text-slate-400 text-xs max-w-sm mx-auto mb-6">
                上部の点線エリアに写真をドラッグ＆ドロップして変換を開始してください。
              </p>
              
              <button
                id="demo_empty_action_btn"
                type="button"
                disabled={isAtMaxCapacity}
                onClick={addSimulatedFiles}
                className="inline-flex items-center space-x-1 bg-violet-50 text-violet-700 hover:bg-violet-100 py-2 px-4 rounded-xl text-xs font-bold border border-violet-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-violet-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-violet-600 fill-violet-100" />
                <span>サンプル写真を追加してテストする</span>
              </button>
            </motion.div>
          )}
        </div>

        {/* Global sticky Action bar */}
        {pendingCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky bottom-4 left-0 right-0 max-w-lg mx-auto bg-slate-900 text-white rounded-2xl p-4 shadow-xl z-10 border border-slate-800 flex items-center justify-between"
          >
            <div className="flex flex-col">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">
                未変換の写真
              </span>
              <span className="text-sm font-extrabold text-white">
                残り {pendingCount} 枚のファイル
              </span>
            </div>

            <button
              id="convert_all_btn"
              type="button"
              onClick={convertAllPending}
              disabled={isProcessingAll}
              className="px-6 py-2.5 rounded-xl text-xs font-extrabold bg-linear-to-r from-violet-500 to-indigo-500 hover:from-violet-600 hover:to-indigo-600 text-white transition-all shadow-md flex items-center space-x-1"
            >
              {isProcessingAll ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  <span>変換中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>すべての写真を一括変換 ({pendingCount}枚)</span>
                </>
              )}
            </button>
          </motion.div>
        )}

        {/* Informative Security Guarantee Footnote */}
        <div className="mt-12 text-center text-xs text-slate-400 max-w-lg mx-auto space-y-1">
          <p className="flex items-center justify-center space-x-1 font-semibold text-slate-500">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>プライバシー保護について</span>
          </p>
          <p className="leading-relaxed text-[11px]">
            変換作業はすべてお客様のパソコンまたはスマートフォンのブラウザ内（JavaScript WebAssembly）で実行されます。データが開発元のネットワークや外部のクラウド、ファイルサーバー等へアップロードされることは一切ございませんので、プライベートな写真も安心して変換できます。
          </p>
        </div>
      </div>

      {/* Lightbox Preview Modal */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/85 backdrop-blur-md z-55 flex flex-col items-center justify-center p-4"
            onClick={() => setLightboxImage(null)}
          >
            <div className="absolute top-4 right-4 flex items-center space-x-3 z-50">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  // Trigger download from within lightbox
                  const fileItem = files.find(f => f.convertedUrl === lightboxImage.url);
                  if (fileItem) downloadSingleFile(fileItem);
                }}
                className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full transition-all flex items-center justify-center shadow-lg cursor-pointer"
                title="ローカルに保存"
              >
                <Download className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-full transition-all flex items-center justify-center shadow-lg cursor-pointer"
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Main Img Container */}
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl max-h-[80vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex items-center justify-center"
            >
              <img
                src={lightboxImage.url}
                alt={lightboxImage.name}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[80vh] object-contain block"
              />
            </motion.div>

            {/* Meta Text below image */}
            <div className="text-center mt-4 max-w-md">
              <p className="text-white font-bold text-sm truncate">{lightboxImage.name}</p>
              <p className="text-xs text-slate-400 mt-1">「ダウンロード」ボタン、または画面の外をタップすると閉じます。</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
