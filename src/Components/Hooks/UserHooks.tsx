import { useEffect, useState } from "react";
import { getLoggedinUser } from "../../helpers/api_helper";

const useProfile = () => {
  const userProfileSession = getLoggedinUser();
  const tokenFromSession = userProfileSession && (userProfileSession["access_token"] || userProfileSession["token"]);
  const [loading, setLoading] = useState(userProfileSession ? false : true);
  const [userProfile, setUserProfile] = useState(
    userProfileSession ? userProfileSession : null
  );

  useEffect(() => {
    const userProfileSession = getLoggedinUser();
    const token = userProfileSession && (userProfileSession["access_token"] || userProfileSession["token"]);
    setUserProfile(userProfileSession ? userProfileSession : null);
    setLoading(token ? false : true);
  }, []);


  const token = tokenFromSession;
  return { userProfile, loading, token };
};

export { useProfile };
