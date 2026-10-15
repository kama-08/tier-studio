import { getAppearance } from '@/core/appearance';
import type { Project } from '@/core/schema';
import type { Asset } from '@/services/storage/database';
import type { BoardExportLayout } from './board-layout';
import { wrapText } from './text-layout';
import { mapConcurrent } from '@/core/async-pool';

type Rect = { x: number; y: number; width: number; height: number };
type Box = Rect & { style: BoardExportLayout['tiers'][number]['style'] };

export function outputDimensions(
  layout: Pick<BoardExportLayout, 'width' | 'height'>,
  requestedScale: number,
) {
  const scale = Math.min(
    requestedScale,
    16000 / layout.height,
    16000 / layout.width,
    Math.sqrt(64_000_000 / (layout.width * layout.height)),
  );
  if (scale < Math.min(0.5, requestedScale))
    throw new Error('This board is too tall to export as one image. Try using more tiers.');
  return {
    scale,
    width: Math.round(layout.width * scale),
    height: Math.round(layout.height * scale),
  };
}

export async function renderProjectPng(
  project: Project,
  assets: Asset[],
  layout: BoardExportLayout,
  requestedScale: number = getAppearance(project).exportScale,
): Promise<Uint8Array> {
  const appearance = getAppearance(project);
  const { colors } = layout;
  const { scale, width, height } = outputDimensions(layout, requestedScale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image export is unavailable.');
  context.scale(scale, scale);
  try {
    const needed = new Set(
      [...layout.tiers.flatMap((tier) => tier.items), ...(layout.unranked?.items ?? [])].flatMap(
        ({ id }) => (project.items[id].assetId ? [project.items[id].assetId!] : []),
      ),
    );
    const included = assets.filter((asset) => needed.has(asset.id));
    if (included.length !== needed.size)
      throw new Error('Some images are missing. Please re-import them before exporting.');
    const assetById = new Map(included.map((asset) => [asset.id, asset]));

    function boxPath(box: Rect, radius: number, inset = 0) {
      context!.beginPath();
      context!.roundRect(
        box.x + inset,
        box.y + inset,
        Math.max(0, box.width - inset * 2),
        Math.max(0, box.height - inset * 2),
        Math.max(0, Math.min(radius - inset, box.width / 2, box.height / 2)),
      );
    }
    function fillBox(box: Box) {
      boxPath(box, box.style.radius);
      context!.fillStyle = box.style.background;
      context!.fill();
    }
    function borderBox(box: Box) {
      if (box.style.borderStyle === 'none' || !box.style.borderWidth) return;
      context!.save();
      boxPath(box, box.style.radius, box.style.borderWidth / 2);
      context!.strokeStyle = box.style.borderColor;
      context!.lineWidth = box.style.borderWidth;
      if (box.style.borderStyle === 'dashed') context!.setLineDash([4, 3]);
      context!.stroke();
      context!.restore();
    }
    async function paintItems(items: BoardExportLayout['tiers'][number]['items']) {
      // Decode, draw and release a bounded number of images. Keeping every
      // decoded image until export finishes can exhaust memory on large boards.
      for (let start = 0; start < items.length; start += 4) {
        const resources: { url: string; image: HTMLImageElement }[] = [];
        try {
          const decoded = await mapConcurrent(items.slice(start, start + 4), 4, async (rect) => {
            const assetId = project.items[rect.id].assetId;
            const asset = assetId ? assetById.get(assetId) : undefined;
            if (!asset) return { rect, image: undefined };
            const url = URL.createObjectURL(asset.blob);
            const image = new Image();
            resources.push({ url, image });
            image.src = url;
            await image.decode();
            return { rect, image };
          });
          // Paint in document order even when decoding finishes out of order.
          // This keeps overlapping shadows deterministic when the gap is zero.
          decoded.forEach(({ rect, image }) => paintItem(rect, image));
        } finally {
          resources.forEach(({ image, url }) => {
            image.src = '';
            URL.revokeObjectURL(url);
          });
        }
      }
    }
    function paintItem(
      rect: BoardExportLayout['tiers'][number]['items'][number],
      image?: HTMLImageElement,
    ) {
      const { id, x, y, width, height } = rect;
      const item = project.items[id];
      const radius =
        project.itemShape === 'circle' ? Math.min(width, height) / 2 : appearance.itemRadius;
      context!.save();
      boxPath(rect, radius);
      if (appearance.itemShadow) {
        context!.shadowColor = '#3543260b';
        context!.shadowBlur = 3;
        context!.shadowOffsetY = 1;
      }
      context!.fillStyle = item.color;
      context!.fill();
      context!.shadowColor = 'transparent';
      context!.clip();
      if (image) {
        const ratio = (appearance.imageFit === 'contain' ? Math.min : Math.max)(
          width / image.width,
          height / image.height,
        );
        context!.drawImage(
          image,
          x + (width - image.width * ratio) / 2,
          y + (height - image.height * ratio) / 2,
          image.width * ratio,
          image.height * ratio,
        );
      } else {
        context!.fillStyle = rect.text.color;
        context!.font = rect.text.font;
        context!.textAlign = 'center';
        context!.textBaseline = 'middle';
        const lines = wrapText(
          item.name,
          Math.max(1, width - 2 * rect.text.padding),
          (text) => context!.measureText(text).width,
          Math.max(1, Math.floor((height - 2 * rect.text.padding) / rect.text.lineHeight)),
        );
        lines.forEach((line, lineIndex) =>
          context!.fillText(
            line,
            x + width / 2,
            y + height / 2 + (lineIndex - (lines.length - 1) / 2) * rect.text.lineHeight,
          ),
        );
      }
      context!.restore();
      if (appearance.itemBorder) {
        context!.save();
        boxPath(rect, radius, 0.5);
        context!.strokeStyle = colors.line;
        context!.lineWidth = 1;
        context!.stroke();
        context!.restore();
      }
    }

    if (!appearance.exportTransparent) {
      context.fillStyle = colors.background;
      context.fillRect(0, 0, layout.width, layout.height);
    }
    if (appearance.exportTitle) {
      context.fillStyle = colors.text;
      context.font = layout.header.titleFont;
      layout.header.titleLines.forEach((line, index) =>
        context.fillText(line, 24, 48 + index * 36),
      );
    }
    if (appearance.exportDescription) {
      context.fillStyle = colors.secondary;
      context.font = layout.header.descriptionFont;
      layout.header.descriptionLines.forEach((line, index) =>
        context.fillText(line, 24, layout.header.descriptionY + index * 20),
      );
    }
    for (const [index, row] of layout.tiers.entries()) {
      const tier = project.tiers[index];
      context.save();
      fillBox(row);
      boxPath(row, row.style.radius);
      context.clip();
      context.fillStyle = tier.color;
      context.fillRect(row.label.x, row.label.y, row.label.width, row.label.height);
      context.fillStyle = row.label.color;
      context.font = `${row.label.fontWeight} ${row.label.fontSize}px ${row.label.fontFamily}`;
      context.textAlign = row.label.align;
      context.textBaseline = 'middle';
      const labelWidth = row.label.width - 2 * row.label.padding;
      const labels = wrapText(
        tier.label,
        labelWidth,
        (text) => context.measureText(text).width,
        Math.max(1, Math.floor((row.label.height - row.label.padding * 2) / row.label.lineHeight)),
      );
      const labelX =
        row.label.x +
        (row.label.align === 'left'
          ? row.label.padding
          : row.label.align === 'right'
            ? row.label.width - row.label.padding
            : row.label.width / 2);
      labels.forEach((line, lineIndex) =>
        context.fillText(
          line,
          labelX,
          row.label.y +
            row.label.height / 2 +
            (lineIndex - (labels.length - 1) / 2) * row.label.lineHeight,
        ),
      );
      await paintItems(row.items);
      context.restore();
      borderBox(row);
    }
    if (layout.unranked) {
      const pool = layout.unranked;
      context.fillStyle = colors.text;
      context.font = '600 13px system-ui';
      context.textAlign = 'left';
      context.fillText(
        `Unranked · ${project.unranked.length}`,
        pool.heading.x,
        pool.heading.y + 13,
      );
      fillBox(pool);
      context.save();
      boxPath(pool, pool.style.radius);
      context.clip();
      await paintItems(pool.items);
      context.restore();
      borderBox(pool);
    }
    if (appearance.exportFooter) {
      context.textAlign = 'left';
      context.font = '12px system-ui';
      context.fillStyle = colors.secondary;
      context.fillText('Made with Tier Studio', 24, layout.height - 16);
    }
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (result) => (result ? resolve(result) : reject(new Error('Could not export this board.'))),
        'image/png',
      ),
    );
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    canvas.width = canvas.height = 0;
  }
}
