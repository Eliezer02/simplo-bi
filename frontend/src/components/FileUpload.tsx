import React, { useState, useCallback } from 'react';
import { UploadCloud } from 'lucide-react';
import { Card, Spinner } from 'react-bootstrap';

interface FileUploadProps {
  onFileSelected: (file: File) => void;
  isLoading: boolean;
  progressMessage: string | null;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelected, isLoading, progressMessage }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File | undefined) => { 
    if (!file) return; 
    onFileSelected(file);
  }, [onFileSelected]);

  
  const handleDragEvents = (e: React.DragEvent<HTMLLabelElement>, dragging: boolean) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(dragging);
  };
  
 
  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    handleDragEvents(e, false);
    const file = e.dataTransfer.files?.[0];
    if (file) { handleFile(file); }
  };

  if (isLoading) {
    return (
      <Card className="text-center shadow-sm mx-auto" style={{ maxWidth: '600px' }}>
        <Card.Body className="p-5">
          <Spinner animation="border" variant="primary" className="mb-3" />
          <p className="h5 text-primary fw-semibold">{progressMessage || 'Processando...'}</p>
          <p className="text-muted">A IA está trabalhando para você. Isso pode levar alguns segundos...</p>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="mx-auto" style={{ maxWidth: '600px' }}>
      <label
        htmlFor="file-upload"
        className={`file-upload-dropzone p-5 text-center rounded-4 bg-white shadow-sm ${isDragging ? 'dragging' : ''}`}
        style={{ cursor: 'pointer' }}
        onDragEnter={(e) => handleDragEvents(e, true)}
        onDragLeave={(e) => handleDragEvents(e, false)}
        onDragOver={(e) => handleDragEvents(e, true)} // Necessário para o onDrop funcionar
        onDrop={handleDrop}
      >
        <div className="d-flex flex-column align-items-center">
          <UploadCloud className="text-secondary" size={48} />
          <p className="mt-3 mb-1 text-secondary">
            <span className="text-primary fw-semibold">Carregue uma planilha</span> ou arraste e solte
          </p>
          <p className="small text-muted mb-0">Arquivos .xlsx, .xls ou .csv são suportados.</p>
          <p className="small text-muted">A IA irá identificar e mapear as colunas automaticamente.</p>
          <input id="file-upload" type="file" className="d-none" onChange={(e) => handleFile(e.target.files?.[0])} accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" />
        </div>
      </label>
    </div>
  );
};

export default FileUpload;