import { api } from '@/lib/api';
import type { CertificateArtwork } from '@/types/certificate-artwork';

export class CertificateArtworksApiService {
  static async list(evaluationId: string): Promise<CertificateArtwork[]> {
    const response = await api.get<CertificateArtwork[]>(`/certificates/${evaluationId}/artworks`);
    return response.data;
  }

  static async upload(evaluationId: string, file: File, name?: string): Promise<CertificateArtwork> {
    const formData = new FormData();
    formData.append('file', file);
    if (name?.trim()) formData.append('name', name.trim());
    const response = await api.post<CertificateArtwork>(
      `/certificates/${evaluationId}/artworks`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  }

  static async activate(evaluationId: string, artworkId: string): Promise<CertificateArtwork> {
    const response = await api.post<CertificateArtwork>(
      `/certificates/${evaluationId}/artworks/${artworkId}/activate`,
    );
    return response.data;
  }

  static originalUrl(evaluationId: string, artworkId: string): string {
    return `/certificates/${evaluationId}/artworks/${artworkId}/original`;
  }
}
