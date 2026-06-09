/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ConversionStatus = 'pending' | 'converting' | 'success' | 'error';

export type OutputFormat = 'jpeg' | 'png';

export interface HEICFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: ConversionStatus;
  progress: number;
  convertedUrl: string | null;
  convertedBlob: Blob | null;
  convertedSize: number | null;
  error: string | null;
  format: OutputFormat;
  maxWidth?: number;
  maxHeight?: number;
}

export interface ConversionSettings {
  globalFormat: OutputFormat;
  quality: number; // 0.1 to 1.0 (for JPEG)
}
