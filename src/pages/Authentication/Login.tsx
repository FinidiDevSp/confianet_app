import React, { useEffect, useState } from 'react';
import { Card, CardBody, Col, Container, Input, Label, Row, Button, Form, FormFeedback, Alert, Spinner } from 'reactstrap';
import axios from 'axios';
import ParticlesAuth from "../AuthenticationInner/ParticlesAuth";

//redux
import { useSelector, useDispatch } from "react-redux";

import { Link } from "react-router-dom";
import withRouter from "../../Components/Common/withRouter";
// Formik validation
import * as Yup from "yup";
import { useFormik } from "formik";

// actions
import { loginUser, socialLogin, resetLoginFlag } from "../../slices/thunks";

import logoLight from "../../assets/images/logo-light.png";
import { createSelector } from 'reselect';
//import images

const Login = (props: any) => {
    const dispatch: any = useDispatch();

    const selectLayoutState = (state: any) => state;
    const loginpageData = createSelector(
        selectLayoutState,
        (state) => ({
            user: state.Account.user,
            error: state.Login.error,
            loading: state.Login.loading,
            errorMsg: state.Login.errorMsg,
            mfaRequired: state.Login.mfaRequired,
            mfaToken: state.Login.mfaToken,
        })
    );
    // Inside your component
    const { user, error, errorMsg, mfaRequired, mfaToken } = useSelector(loginpageData);

    const [userLogin, setUserLogin] = useState<any>([]);
    const [passwordShow, setPasswordShow] = useState<boolean>(false);
    const [loader, setLoader] = useState<boolean>(false);

    useEffect(() => {
        if (user && user) {
            const updatedUserData = process.env.REACT_APP_DEFAULTAUTH === "firebase" ? user.multiFactor.user.email : user.user.email;
            const updatedUserPassword = process.env.REACT_APP_DEFAULTAUTH === "firebase" ? "" : user.user.confirm_password;
            setUserLogin({
                email: updatedUserData,
                password: updatedUserPassword
            });
        }
    }, [user]);

    const validation: any = useFormik({
        // enableReinitialize : use this flag when initial values needs to be changed
        enableReinitialize: true,

        initialValues: {
            email: userLogin.email || "admin@example.com" || '',
            password: userLogin.password || "123456" || '',
        },
        validationSchema: Yup.object({
            email: Yup.string().required("Please Enter Your Email"),
            password: Yup.string().required("Please Enter Your Password"),
        }),
        onSubmit: (values) => {
            dispatch(loginUser(values, props.router.navigate));
            setLoader(true)
        }
    });

    const signIn = (type: any) => {
        dispatch(socialLogin(type, props.router.navigate));
    };

    //handleTwitterLoginResponse
    // const twitterResponse = e => {}

    //for facebook and google authentication
    const socialResponse = (type: any) => {
        signIn(type);
    };


    useEffect(() => {
        if (errorMsg) {
            setTimeout(() => {
                dispatch(resetLoginFlag());
                setLoader(false)
            }, 3000);
        }
    }, [dispatch, errorMsg]);

    const [mfaCode, setMfaCode] = useState<string>("");
    const [mfaSetupSecret, setMfaSetupSecret] = useState<string>("");
    const [mfaSetupQr, setMfaSetupQr] = useState<string>("");
    document.title = "Basic SignIn | Velzon - React Admin & Dashboard Template";
    return (
        <React.Fragment>
            <ParticlesAuth>
                <div className="auth-page-content mt-lg-5">
                    <Container>
                        <Row>
                            <Col lg={12}>
                                <div className="text-center mt-sm-5 mb-4 text-white-50">
                                    <div>
                                        <Link to="/" className="d-inline-block auth-logo">
                                            <img src={logoLight} alt="" height="20" />
                                        </Link>
                                    </div>
                                    <p className="mt-3 fs-15 fw-medium">Confianet • Acceso al panel</p>
                                </div>
                            </Col>
                        </Row>

                        <Row className="justify-content-center">
                            <Col md={8} lg={6} xl={5}>
                                <Card className="mt-4">
                                    <CardBody className="p-4">
                                        <div className="text-center mt-2">
                                            <h5 className="text-primary">Acceso al Panel</h5>
                                            <p className="text-muted">Inicia sesión para continuar.</p>
                                        </div>
                                        {error && error ? (
                                            <Alert color="danger" isOpen transition={{ timeout: 200 }}>
                                                {String(error)}
                                            </Alert>
                                        ) : null}
                                        <div className="p-2 mt-4">
                                            <Form
                                                onSubmit={(e) => {
                                                    e.preventDefault();
                                                    validation.handleSubmit();
                                                    return false;
                                                }}
                                                action="#">

                                                <div className="mb-3">
                                                    <Label htmlFor="email" className="form-label">Correo electrónico</Label>
                                                    <Input
                                                        name="email"
                                                        className="form-control"
                                                        placeholder="Enter email"
                                                        type="email"
                                                        onChange={validation.handleChange}
                                                        onBlur={validation.handleBlur}
                                                        value={validation.values.email || ""}
                                                        invalid={
                                                            validation.touched.email && validation.errors.email ? true : false
                                                        }
                                                    />
                                                    {validation.touched.email && validation.errors.email ? (
                                                        <FormFeedback type="invalid">{validation.errors.email}</FormFeedback>
                                                    ) : null}
                                                </div>

                                                <div className="mb-3">
                                                    <div className="float-end">
                                                        <Link to="/forgot-password" className="text-muted">¿Olvidaste tu contraseña?</Link>
                                                    </div>
                                                    <Label className="form-label" htmlFor="password-input">Contraseña</Label>
                                                    <div className="position-relative auth-pass-inputgroup mb-3">
                                                        <Input
                                                            name="password"
                                                            value={validation.values.password || ""}
                                                            type={passwordShow ? "text" : "password"}
                                                            className="form-control pe-5"
                                                            placeholder="Enter Password"
                                                            onChange={validation.handleChange}
                                                            onBlur={validation.handleBlur}
                                                            invalid={
                                                                validation.touched.password && validation.errors.password ? true : false
                                                            }
                                                        />
                                                        {validation.touched.password && validation.errors.password ? (
                                                            <FormFeedback type="invalid">{validation.errors.password}</FormFeedback>
                                                        ) : null}
                                                    <button className="btn btn-link position-absolute end-0 top-0 text-decoration-none text-muted" type="button" id="password-addon" onClick={() => setPasswordShow(!passwordShow)}><i className="ri-eye-fill align-middle"></i></button>
                                                    </div>
                                                </div>

                                                {mfaRequired && (
                                                  <div className="mb-3">
                                                    <Label className="form-label" htmlFor="mfa-code">Código 2FA</Label>
                                                    <Input id="mfa-code" placeholder="Introduce el código de 6 dígitos" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
                                                    <div className="mt-2">
                                                      <Button color="primary" type="button" onClick={() => {
                                                        if (!mfaToken) return;
                                                        const mod: any = require('../../slices/auth/login/thunk');
                                                        dispatch(mod.verifyMfa(mfaToken, mfaCode, undefined, props.router.navigate));
                                                      }}>Verificar 2FA</Button>
                                                    </div>
                                                    <hr />
                                                    <div className="mt-2">
                                                      <p className="mb-2">¿Es tu primer acceso con 2FA? Configura el código con un QR:</p>
                                                      {!mfaSetupQr ? (
                                                        <Button color="secondary" type="button" onClick={async () => {
                                                          if (!mfaToken) return;
                                                          try {
                                                            const res: any = await axios.post('/api/auth/mfa/setup/start', { mfa_token: mfaToken });
                                                            setMfaSetupSecret(res.secret);
                                                            setMfaSetupQr(res.qr_data_url);
                                                          } catch (e:any) {
                                                            // ignore or show error
                                                          }
                                                        }}>Generar QR</Button>
                                                      ) : (
                                                        <div>
                                                          <img alt="QR 2FA" src={mfaSetupQr} style={{ maxWidth: 200 }} />
                                                          <div className="mt-2">
                                                            <Label className="form-label">Código de 6 dígitos de tu app</Label>
                                                            <Input placeholder="123456" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
                                                            <Button className="mt-2" color="success" type="button" onClick={async () => {
                                                              if (!mfaToken || !mfaSetupSecret || !mfaCode) return;
                                                              try {
                                                                const res: any = await axios.post('/api/auth/mfa/setup/confirm', { mfa_token: mfaToken, secret: mfaSetupSecret, code: mfaCode });
                                                                // Después de confirmar, valida 2FA para emitir tokens
                                                                const mod: any = require('../../slices/auth/login/thunk');
                                                                dispatch(mod.verifyMfa(mfaToken, mfaCode, undefined, props.router.navigate));
                                                              } catch (e:any) {}
                                                            }}>Confirmar 2FA</Button>
                                                          </div>
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                )}

                                                <div className="form-check">
                                                    <Input className="form-check-input" type="checkbox" value="" id="auth-remember-check" />
                                                    <Label className="form-check-label" htmlFor="auth-remember-check">Remember me</Label>
                                                </div>

                                                <div className="mt-4">
                                                    <Button color="success"
                                                        disabled={loader && true}
                                                        className="btn btn-success w-100" type="submit">
                                                        {loader && <Spinner size="sm" className='me-2'> Loading... </Spinner>}
                                                        Acceder
                                                    </Button>
                                                </div>

                                                
                                            </Form>
                                        </div>
                                    </CardBody>
                                </Card>

                                

                            </Col>
                        </Row>
                    </Container>
                </div>
            </ParticlesAuth>
        </React.Fragment>
    );
};

export default withRouter(Login);

