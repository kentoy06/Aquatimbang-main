// Import Axios so the React frontend can communicate with Django.
import axios from "axios";

// Create the main AquaTimbang API connection.
const api = axios.create({
  // Address of the Django REST API.
  baseURL: "http://127.0.0.1:8000/api/",

  // AquaTimbang sends and receives JSON data.
  headers: {
    "Content-Type": "application/json",
  },
});

// Run this before every request sent to Django.
api.interceptors.request.use(
  (config) => {
    // Retrieve the login token saved in the browser.
    const token = localStorage.getItem("authToken");

    // Protected Django endpoints require:
    // Authorization: Token <token>
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }

    return config;
  },
  (error) => {
    // Return any request error to the component that made the request.
    return Promise.reject(error);
  }
);

// Allow other React files to use this API connection.
export default api;