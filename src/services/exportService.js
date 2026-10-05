'use strict';

const { generatePlaybackScript } = require('../utils/scriptGenerator');

/**
 * exportService.js
 * Generates exportable content from ASCII frame data.
 * Called by exportController after receiving client-submitted frame data.
 */

/**
 * Generate plain-text animation file.
 * Frames are separated by a recognizable ASCII banner with metadata.
 *
 * @param {Array<{ ascii: string, delay: number }>} frames
 * @param {object} meta - Session/conversion metadata
 * @returns {string}
 */
function generateTXTExport(frames, meta = {}) {
  const { gifName = 'animation', asciiWidth = 80, frameCount = frames.length } = meta;
  const separator = '─'.repeat(asciiWidth);

  const header = [
    `# ASCII Terminal GIF Export`,
    `# Source: ${gifName}`,
    `# Frames: ${frameCount}`,
    `# Width:  ${asciiWidth} cols`,
    `# Generated: ${new Date().toISOString()}`,
    `# Player: ./play_ascii.sh`,
    '',
  ].join('\n');

  const body = frames
    .map((frame, i) =>
      [
        `${separator}`,
        `# FRAME ${String(i).padStart(4, '0')} | delay=${frame.delay}ms`,
        `${separator}`,
        frame.ascii,
      ].join('\n')
    )
    .join('\n\n');

  return header + '\n' + body;
}

/**
 * Generate JSON export containing full frame data.
 * Useful for custom players, data processing, or re-importing.
 *
 * @param {Array<{ ascii: string, delay: number }>} frames
 * @param {object} meta
 * @returns {string} Stringified JSON
 */
function generateJSONExport(frames, meta = {}) {
  const payload = {
    version: '1.0.0',
    generator: 'ASCII Terminal GIF Converter',
    generatedAt: new Date().toISOString(),
    meta: {
      gifName: meta.gifName || 'animation',
      frameCount: frames.length,
      asciiWidth: meta.asciiWidth || 80,
      asciiHeight: meta.asciiHeight || 24,
      densityPreset: meta.densityPreset || 'standard',
      mode: meta.mode || 'grayscale',
    },
    frames: frames.map((frame, index) => ({
      index,
      delay: frame.delay,
      ascii: frame.ascii,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Generate individual frame .txt files as a zip-ready data structure.
 * Returns array of { filename, content } objects.
 *
 * @param {Array<{ ascii: string, delay: number }>} frames
 * @returns {Array<{ filename: string, content: string }>}
 */
function generateFrameFiles(frames) {
  return frames.map((frame, i) => ({
    filename: `frame_${String(i).padStart(4, '0')}.txt`,
    content: frame.ascii,
  }));
}

/**
 * Generate the self-contained bash playback script.
 *
 * @param {Array<{ ascii: string, delay: number }>} frames
 * @param {object} meta
 * @returns {string}
 */
function generateBashScript(frames, meta = {}) {
  return generatePlaybackScript(frames, {
    gifName: meta.gifName || 'animation',
    defaultFps: meta.fps || 10,
    densityPreset: meta.densityPreset || 'standard',
    asciiWidth: meta.asciiWidth || 80,
  });
}

/**
 * Generate a terminal playback one-liner command (for clipboard copy).
 * Uses Python as a cross-platform fallback since it's commonly available.
 *
 * @param {string} scriptName
 * @returns {string}
 */
function generatePlaybackCommand(scriptName = 'play_ascii.sh') {
  return `chmod +x ${scriptName} && ./${scriptName}`;
}

module.exports = {
  generateTXTExport,
  generateJSONExport,
  generateFrameFiles,
  generateBashScript,
  generatePlaybackCommand,
};
