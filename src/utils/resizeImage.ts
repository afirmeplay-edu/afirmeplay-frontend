/**
 * Utilitário para normalizar o tamanho (em pixels) de imagens enviadas nas interações
 * subjetivas (ex.: "Ligar Colunas", "Arrastar e Soltar"). Garante que todas as imagens
 * de um mesmo contexto fiquem com as mesmas dimensões, mesmo que o arquivo original
 * enviado pelo usuário tenha uma resolução diferente.
 */

export type ResizeFitMode = "contain" | "cover";

/** Dimensões-alvo (em pixels) por tipo de proporção usado em `InteractionImageUpload`. */
export const TARGET_SIZE_BY_ASPECT: Record<string, { width: number; height: number } | undefined> = {
  wide: { width: 480, height: 270 }, // 16:9 — arrastar e soltar / ligar colunas
  square: { width: 320, height: 320 }, // 1:1 — ordenação / substituição / construção de resposta
  auto: undefined, // sem proporção fixa definida: mantém o arquivo original
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Falha ao carregar a imagem."));
    img.src = src;
  });
}

/**
 * Redimensiona um arquivo de imagem para as dimensões exatas informadas, desenhando-o
 * num canvas fora da tela, e retorna o resultado como dataURL (base64).
 *
 * - `contain`: a imagem inteira é exibida (sem cortes), preenchendo o espaço restante
 *   com fundo branco.
 * - `cover`: a imagem preenche toda a área, cortando o excesso quando a proporção
 *   original é diferente da proporção de destino.
 */
export async function resizeImageToDataUrl(
  file: File,
  targetWidth: number,
  targetHeight: number,
  mode: ResizeFitMode = "contain"
): Promise<string> {
  const originalDataUrl = await readFileAsDataUrl(file);
  const image = await loadImage(originalDataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    // Fallback: navegador sem suporte a canvas — mantém o arquivo original.
    return originalDataUrl;
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  const scale =
    mode === "cover"
      ? Math.max(targetWidth / image.width, targetHeight / image.height)
      : Math.min(targetWidth / image.width, targetHeight / image.height);

  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const dx = (targetWidth - drawWidth) / 2;
  const dy = (targetHeight - drawHeight) / 2;

  ctx.drawImage(image, dx, dy, drawWidth, drawHeight);

  const isPng = file.type === "image/png";
  return canvas.toDataURL(isPng ? "image/png" : "image/jpeg", 0.9);
}
