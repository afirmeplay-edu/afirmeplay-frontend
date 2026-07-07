import React, { useState, useEffect } from 'react';
import type { CertificateTemplate } from '@/types/certificates';
import { loadCertificateImage, getAccessToken, getCityId, revokeCertificateImageBlob } from '@/utils/certificateImageUtils';

interface CertificateTemplateProps {
  template: CertificateTemplate;
  studentName?: string;
  evaluationTitle?: string;
  grade?: number;
  className?: string;
  resolvedImages?: {
    logoUrl?: string;
    signatureUrl?: string;
  };
}

export function CertificateTemplateComponent({
  template,
  studentName = 'Nome do Aluno',
  evaluationTitle = 'Avaliação',
  grade,
  className = '',
  resolvedImages,
}: CertificateTemplateProps) {
  const [logoUrl, setLogoUrl] = useState<string | undefined>(resolvedImages?.logoUrl);
  const [signatureUrl, setSignatureUrl] = useState<string | undefined>(
    resolvedImages?.signatureUrl
  );
  const [isLoadingImages, setIsLoadingImages] = useState(false);

  useEffect(() => {
    if (resolvedImages) {
      setLogoUrl(resolvedImages.logoUrl);
      setSignatureUrl(resolvedImages.signatureUrl);
      return;
    }

    const accessToken = getAccessToken();
    const cityId = getCityId();

    const loadImages = async () => {
      setIsLoadingImages(true);

      try {
        const [loadedLogo, loadedSignature] = await Promise.all([
          loadCertificateImage(template.logo_url, accessToken, cityId),
          loadCertificateImage(template.signature_url, accessToken, cityId),
        ]);

        setLogoUrl(loadedLogo);
        setSignatureUrl(loadedSignature);
      } catch (error) {
        console.error('Erro ao carregar imagens do certificado:', error);
      } finally {
        setIsLoadingImages(false);
      }
    };

    loadImages();

    return () => {
      if (template.logo_url) {
        revokeCertificateImageBlob(template.logo_url, accessToken);
      }
      if (template.signature_url) {
        revokeCertificateImageBlob(template.signature_url, accessToken);
      }
    };
  }, [template.logo_url, template.signature_url, resolvedImages]);

  const formatDate = (dateString?: string) => {
    if (!dateString) return new Date().toLocaleDateString('pt-BR');
    try {
      return new Date(dateString).toLocaleDateString('pt-BR');
    } catch {
      return new Date().toLocaleDateString('pt-BR');
    }
  };

  // Proporção A4 paisagem: 297mm x 210mm
  // Aspect ratio: 297/210 = 1.414 (aproximadamente)
  const isFullSize = className?.includes('w-full') && className?.includes('h-full');
  
  // Configurações de tamanho de fonte baseado na opção selecionada
  const fontSizeConfig = {
    'small': {
      title: 'clamp(18px, 3vw, 32px)',
      content: 'clamp(10px, 1.4vw, 14px)',
      studentName: 'clamp(14px, 2.5vw, 22px)',
      details: 'clamp(9px, 1.2vw, 12px)',
      footer: 'clamp(8px, 1vw, 10px)'
    },
    'medium': {
      title: 'clamp(24px, 4vw, 42px)',
      content: 'clamp(12px, 1.8vw, 16px)',
      studentName: 'clamp(18px, 3vw, 26px)',
      details: 'clamp(11px, 1.5vw, 14px)',
      footer: 'clamp(10px, 1.2vw, 12px)'
    },
    'large': {
      title: 'clamp(28px, 5vw, 52px)',
      content: 'clamp(14px, 2.2vw, 20px)',
      studentName: 'clamp(22px, 3.5vw, 32px)',
      details: 'clamp(13px, 1.8vw, 16px)',
      footer: 'clamp(11px, 1.4vw, 14px)'
    },
    'extra-large': {
      title: 'clamp(32px, 6vw, 62px)',
      content: 'clamp(16px, 2.6vw, 24px)',
      studentName: 'clamp(26px, 4vw, 38px)',
      details: 'clamp(15px, 2vw, 18px)',
      footer: 'clamp(12px, 1.6vw, 16px)'
    }
  };
  
  const fontSize = fontSizeConfig[template.font_size || 'medium'];

  return (
    <div
      className={`certificate-template ${className}`}
      style={{
        backgroundColor: template.background_color || '#ffffff',
        color: template.text_color || '#000000',
        // Layout paisagem A4 com proporções corretas
        width: '100%',
        height: isFullSize ? '100%' : 'auto',
        aspectRatio: isFullSize ? 'auto' : '297 / 210', // Proporção A4 paisagem (só se não for full size)
        maxWidth: isFullSize ? 'none' : '1000px', // Sem limite se for full size
        padding: '5%',
        position: 'relative',
        border: `6px solid ${template.accent_color || '#1e40af'}`,
        borderRadius: '4px',
        boxShadow: isFullSize ? 'none' : '0 10px 40px rgba(0, 0, 0, 0.1)',
        fontFamily: 'serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage: logoUrl ? `url(${logoUrl})` : 'none',
        backgroundSize: '15%',
        backgroundPosition: 'top center',
        backgroundRepeat: 'no-repeat',
        paddingTop: logoUrl ? '15%' : '5%',
        boxSizing: 'border-box'
      }}
    >
      {/* Decorative border elements - ajustados para paisagem */}
      <div
        style={{
          position: 'absolute',
          top: '15px',
          left: '15px',
          width: '50px',
          height: '50px',
          border: `2px solid ${template.accent_color || '#1e40af'}`,
          borderRight: 'none',
          borderBottom: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: '15px',
          right: '15px',
          width: '50px',
          height: '50px',
          border: `2px solid ${template.accent_color || '#1e40af'}`,
          borderLeft: 'none',
          borderBottom: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '15px',
          left: '15px',
          width: '50px',
          height: '50px',
          border: `2px solid ${template.accent_color || '#1e40af'}`,
          borderRight: 'none',
          borderTop: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '15px',
          right: '15px',
          width: '50px',
          height: '50px',
          border: `2px solid ${template.accent_color || '#1e40af'}`,
          borderLeft: 'none',
          borderTop: 'none'
        }}
      />

      {/* Main content - layout otimizado para paisagem */}
      <div
        style={{
          textAlign: 'center',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '15px',
          padding: '10px 20px'
        }}
      >
        {/* Title */}
        <h1
          style={{
            fontSize: fontSize.title,
            fontWeight: 'bold',
            margin: 0,
            color: template.accent_color || '#1e40af',
            textTransform: 'uppercase',
            letterSpacing: '3px'
          }}
        >
          {template.title || 'Certificado'}
        </h1>

        {/* Main text content */}
        <div
          style={{
            fontSize: fontSize.content,
            lineHeight: '1.6',
            color: template.text_color || '#000000',
            maxWidth: '90%'
          }}
          dangerouslySetInnerHTML={{ __html: template.text_content }}
        />

        {/* Student information */}
        {studentName && (
          <div style={{ width: '100%' }}>
            <div
              style={{
                fontSize: fontSize.studentName,
                fontWeight: 'bold',
                color: template.accent_color || '#1e40af',
                marginBottom: '10px',
                borderBottom: `2px solid ${template.accent_color || '#1e40af'}`,
                paddingBottom: '8px',
                display: 'inline-block',
                minWidth: '300px',
                maxWidth: '80%'
              }}
            >
              {studentName}
            </div>
            <div style={{ fontSize: fontSize.details, marginTop: '10px' }}>
              {evaluationTitle && (
                <p style={{ margin: '3px 0' }}>
                  <strong>Avaliação:</strong> {evaluationTitle}
                </p>
              )}
              {grade !== undefined && (
                <p style={{ margin: '3px 0' }}>
                  <strong>Nota:</strong> {grade.toFixed(1)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Footer: Date and Signature */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingTop: '10px'
          }}
        >
          {/* Date */}
          <div
            style={{
              fontSize: fontSize.footer,
              color: template.text_color || '#000000',
              opacity: 0.7
            }}
          >
            Data de emissão: {formatDate(template.custom_date)}
          </div>

          {/* Signature */}
          {signatureUrl && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px'
              }}
            >
              <img
                src={signatureUrl}
                alt="Assinatura"
                style={{
                  maxWidth: '150px',
                  maxHeight: '60px',
                  objectFit: 'contain'
                }}
              />
              <div
                style={{
                  borderTop: `1px solid ${template.text_color || '#000000'}`,
                  width: '150px',
                  paddingTop: '5px',
                  fontSize: fontSize.footer,
                  fontWeight: 'bold'
                }}
              >
                Diretor
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

