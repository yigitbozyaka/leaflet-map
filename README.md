# Enhanced Route Analysis and Visualization Tool

This project is an advanced web-based mapping tool that provides real-time traffic analysis, route optimization, and interactive map features. It leverages the TomTom API for accurate traffic data and the Google Generative AI for intelligent route summaries.

## Key Features

- **Real-time Traffic Analysis**: Get up-to-the-minute traffic congestion data to make informed decisions about your routes.
- **Route Optimization**: The Traveling Salesperson Problem (TSP) solver finds the most efficient route for multiple destinations.
- **Interactive Map**: A user-friendly, interactive map interface built with Leaflet and React-Leaflet.
- **AI-Powered Summaries**: Utilizes Google's Generative AI to provide natural language summaries of route analysis.
- **TomTom API Integration**: Fetches traffic data and route information from the TomTom API.
- **MongoDB Integration**: Caches API responses to improve performance and reduce latency.
- **OSRM Backend Integration**: Gets detailed route information and turn-by-turn instructions from an OSRM backend.

## Technologies Used

- **Frontend**: Next.js, React, Tailwind CSS
- **Mapping**: Leaflet, React-Leaflet
- **Backend**: Node.js, OSRM
- **API Integration**: Axios for making HTTP requests to third-party APIs
- **Database**: MongoDB for caching
- **AI**: Google Generative AI for route analysis summaries

## Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

- Node.js and npm installed on your machine.
- A MongoDB instance (local or cloud-based).
- API keys for TomTom and Google Generative AI.

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/yigitbozyaka/leaflet-map.git
   ```
2. Navigate to the project directory:
   ```sh
   cd leaflet-map
   ```
3. Install NPM packages:
   ```sh
   npm install
   ```
4. Create a `.env` file in the root directory and add your API keys and MongoDB connection string:
   ```env
   TOMTOM_API_KEY=your_tomtom_api_key
   GEMINI_API_KEY=your_gemini_api_key
   MONGODB_URI=your_mongodb_connection_string
   NEXT_PUBLIC_BASE_URL=http://localhost:3000
   OSRM_BACKEND_URL=http://localhost:5001
   ```

### Running the Application

Once the installation is complete, you can run the application with the following command:

```sh
npm run dev
```

This will start the development server at `http://localhost:3000`.

By default, the application uses the TomTom API for routing. However, if you provide the `OSRM_BACKEND_URL` in your `.env` file, you can switch to using your own OSRM server for routing by selecting the "Local" route option in the frontend.

## API Endpoints

The application exposes several API endpoints for fetching data:

- `GET /api/analyzer`: Analyzes a given route and provides an AI-powered summary.
- `GET /api/tomtom`: Fetches route information from the TomTom API.
- `GET /api/traffic/data`: Retrieves real-time traffic data.
- `GET /api/traffic/segments`: Gets detailed information about traffic segments.
- `GET /api/tsp`: Solves the Traveling Salesperson Problem for a set of coordinates.
