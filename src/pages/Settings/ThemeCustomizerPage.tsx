import React from "react";
import RightSidebar from "../../Components/Common/RightSidebar";

const ThemeCustomizerPage: React.FC = () => {
  React.useEffect(() => {
    document.title = "Theme Customizer";
  }, []);

  return (
    <div className="container-fluid">
      <div className="row">
        <div className="col-12">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h4 className="mb-0">Theme Customizer</h4>
          </div>
        </div>
      </div>

      {/* Render existing customizer UI; it opens by default and can be toggled */}
      <RightSidebar />
    </div>
  );
};

export default ThemeCustomizerPage;
