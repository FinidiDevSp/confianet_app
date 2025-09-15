//Include Both Helper File with needed methods
import { getFirebaseBackend } from "../../../helpers/firebase_helper";
import { postFakeLogin, postJwtLogin } from "../../../helpers/fakebackend_helper";
import { authLogin, authMfaVerify } from "../../../helpers/auth_api";

import { loginSuccess, logoutUserSuccess, apiError, reset_login_flag, mfaRequired as setMfaRequired } from './reducer';

// const fireBaseBackend = getFirebaseBackend();

export const loginUser = (user : any, history : any) => async (dispatch : any) => {
  try {
    let response;
    if (process.env.REACT_APP_DEFAULTAUTH === "firebase") {
      let fireBaseBackend : any = getFirebaseBackend();
      response = fireBaseBackend.loginUser(
        user.email,
        user.password
      );
    } else if (process.env.REACT_APP_DEFAULTAUTH === "jwt") {
      response = postJwtLogin({
        email: user.email,
        password: user.password
      });
    } else if (process.env.REACT_APP_DEFAULTAUTH === "fastapi") {
      response = authLogin({
        email: user.email,
        password: user.password,
      });
    } else if (process.env.REACT_APP_API_URL) {
      response = postFakeLogin({
        email: user.email,
        password: user.password,
      });
    }

    var data: any = await response;

    if (data) {
      if (data.mfa_required) {
        dispatch(setMfaRequired(data.mfa_token));
        return;
      }
      if (data.access_token) {
        sessionStorage.setItem("authUser", JSON.stringify(data));
      }
      if (process.env.REACT_APP_DEFAULTAUTH === "fake") {
        var finallogin: any= JSON.stringify(data);
        finallogin = JSON.parse(finallogin)
        data = finallogin.data;
        if (finallogin.status === "success") {
          dispatch(loginSuccess(data));
          history('/dashboard-audit')
        } else {
          dispatch(apiError(finallogin));
        }
      } else {
        if (data.access_token) {
          dispatch(loginSuccess(data));
          history('/dashboard-audit')
        } else {
          dispatch(apiError({ detail: 'Unexpected login response' } as any));
        }
      }
    }
  } catch (error : any) {
    dispatch(apiError(error));
  }
};

export const logoutUser = () => async (dispatch : any) => {
  try {
    sessionStorage.removeItem("authUser");
    let fireBaseBackend : any= getFirebaseBackend();
    if (process.env.REACT_APP_DEFAULTAUTH === "firebase") {
      const response = fireBaseBackend.logout;
      dispatch(logoutUserSuccess(response));
    } else {
      dispatch(logoutUserSuccess(true));
    }

  } catch (error : any) {
    dispatch(apiError(error));
  }
};

export const socialLogin = (type : any, history : any) => async (dispatch : any) => {
  try {
    let response;

    if (process.env.REACT_APP_DEFAULTAUTH === "firebase") {
      const fireBaseBackend : any = getFirebaseBackend();
      response = fireBaseBackend.socialLoginUser(type);
    }
    //  else {
      //   response = postSocialLogin(data);
      // }
      
      const socialdata = await response;
    if (socialdata) {
      sessionStorage.setItem("authUser", JSON.stringify(response));
      dispatch(loginSuccess(response));
      history('/dashboard')
    }

  } catch (error : any) {
    dispatch(apiError(error));
  }
};

export const resetLoginFlag = () => async (dispatch : any) => {
  try {
    const response = dispatch(reset_login_flag());
    return response;
  } catch (error : any ){
    dispatch(apiError(error));
  }
};

export const verifyMfa = (mfa_token: string, code?: string, recovery_code?: string, navigate?: any) => async (dispatch: any) => {
  try {
    const data: any = await authMfaVerify({ mfa_token, code, recovery_code });
    if (data && data.access_token) {
      sessionStorage.setItem("authUser", JSON.stringify(data));
      dispatch(loginSuccess(data));
      if (navigate) navigate('/dashboard-audit');
    } else {
      dispatch(apiError({ detail: 'Invalid MFA response' } as any));
    }
  } catch (error: any) {
    dispatch(apiError(error));
  }
};
