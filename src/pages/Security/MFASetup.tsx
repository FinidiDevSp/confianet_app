import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, CardBody, Col, Container, Form, Input, Label, Modal, ModalBody, ModalFooter, ModalHeader, Row, Spinner } from 'reactstrap';
import axios from 'axios';
import { getLoggedinUser, setAuthorization } from '../../helpers/api_helper';

const MFASetup: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [secret, setSecret] = useState('');
  const [qr, setQr] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    try {
      const u: any = getLoggedinUser();
      const t = u && (u.access_token || u.token);
      if (t) setAuthorization(t);
    } catch {}
  }, []);

  const start = async () => {
    setError(null); setMessage(null);
    try {
      setLoading(true);
      const res: any = await axios.post('/api/users/mfa/setup/start', {});
      setSecret(res.secret);
      setQr(res.qr_data_url);
      setMessage('Escanea el QR con tu app 2FA');
    } catch (e: any) {
      setError(e?.message || 'No se pudo iniciar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const confirm = async () => {
    setError(null); setMessage(null);
    try {
      setLoading(true);
      const res: any = await axios.post('/api/users/mfa/setup/confirm', { secret, code });
      if (res && Array.isArray(res.recovery_codes)) {
        setRecoveryCodes(res.recovery_codes);
        setShowModal(true);
      }
      setMessage('2FA habilitado');
    } catch (e: any) {
      setError(e?.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-content">
      <Container fluid>
        <Row>
          <Col lg={12}><h4 className="mb-3">Configurar 2FA (TOTP)</h4></Col>
        </Row>
        {message && <Alert color="success" isOpen transition={{ timeout: 200 }}>{message}</Alert>}
        {error && <Alert color="danger" isOpen transition={{ timeout: 200 }}>{error}</Alert>}
        <Row>
          <Col md={8} lg={6} xl={5}>
            <Card>
              <CardBody>
                <p>Activa el doble factor de autenticación con Google Authenticator o Authy.</p>
                {!qr ? (
                  <Button color="primary" onClick={start} disabled={loading}>{loading ? <Spinner size="sm"/> : 'Generar QR'}</Button>
                ) : (
                  <>
                    <div className="mb-3">
                      <img alt="QR 2FA" src={qr} style={{ maxWidth: 220 }} />
                    </div>
                    <div className="mb-3">
                      <Label>Código de 6 dígitos</Label>
                      <Input placeholder="123456" value={code} onChange={e => setCode(e.target.value)} />
                    </div>
                    <Button color="success" onClick={confirm} disabled={loading || code.length < 6}>{loading ? <Spinner size="sm"/> : 'Confirmar'}</Button>
                  </>
                )}
              </CardBody>
            </Card>
          </Col>
        </Row>
        <Modal isOpen={showModal} toggle={() => setShowModal(false)} centered>
          <ModalHeader toggle={() => setShowModal(false)}>Códigos de recuperación</ModalHeader>
          <ModalBody>
            <p>Guárdalos en lugar seguro. Cada código se usa una sola vez.</p>
            <pre style={{ background: '#f8f9fa', padding: 12, borderRadius: 4 }}>{recoveryCodes.join('\n')}</pre>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={() => {
              try {
                const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'confianet-recovery-codes.txt';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch {}
            }}>Descargar</Button>
            <Button color="primary" onClick={() => setShowModal(false)}>Cerrar</Button>
          </ModalFooter>
        </Modal>
      </Container>
    </div>
  );
};

export default MFASetup;

