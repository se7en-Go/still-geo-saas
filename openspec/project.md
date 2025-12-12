# Project Context

## Purpose
GEO优化系统 is a comprehensive content optimization and generation platform designed for geographic/geospatial SEO and content strategy. The system combines AI-powered content generation with keyword management, image libraries, and analytics to help businesses optimize their online presence for location-based searches and content marketing.

### Core Features:
- **Keyword Management**: Research, track, and optimize GEO-specific keywords
- **Content Generation**: AI-powered content creation with customizable rules and templates
- **Image Library**: Organized image collections with metadata and search capabilities
- **Knowledge Base**: Centralized document storage and retrieval system
- **Analytics Dashboard**: Comprehensive GEO performance metrics and insights
- **Content Scheduling**: Automated content publishing and management
- **User Management**: Role-based access control and team collaboration

## Tech Stack

### Backend (Node.js/Express)
- **Runtime**: Node.js with Express.js framework
- **Database**: PostgreSQL with connection pooling
- **Authentication**: JWT-based authentication with bcryptjs
- **Queue System**: BullMQ with Redis for job processing
- **File Upload**: Multer for multipart form data handling
- **Document Processing**: mammoth (Word documents), pdf-parse (PDF files)
- **Logging**: Winston structured logging
- **Validation**: Joi for request validation
- **Testing**: Jest with supertest for API testing

### Frontend (React)
- **Framework**: React 19.2.0 with React Router DOM 7.9.4
- **UI Library**: Ant Design 5.27.6 with comprehensive component set
- **Charts**: @ant-design/charts for data visualization
- **HTTP Client**: Axios for API communication
- **Date Handling**: Day.js for date manipulation
- **Testing**: React Testing Library with Jest
- **Storybook**: Component documentation and development

### Development & Deployment
- **Package Management**: npm with separate backend/frontend workspaces
- **Environment**: dotenv for configuration management
- **Development**: nodemon for backend hot-reloading
- **Deployment**: Render hosting with GitHub Actions CI/CD
- **Process Management**: PM2-style graceful shutdown handling

## Project Conventions

### Code Style
- **JavaScript**: ES6+ features with functional programming patterns
- **File Naming**: kebab-case for files (e.g., `content-generation.js`)
- **Component Naming**: PascalCase for React components
- **Constants**: UPPER_SNAKE_CASE for environment variables and constants
- **Functions**: camelCase with descriptive names
- **Error Handling**: Centralized error handling middleware with proper HTTP status codes
- **Logging**: Structured logging with contextual information and appropriate log levels

### Architecture Patterns
- **MVC Pattern**: Separation of concerns with routes, controllers, and models
- **Middleware Pattern**: Express middleware for authentication, validation, and error handling
- **Service Layer**: Business logic separated from route handlers
- **Repository Pattern**: Database abstraction layer for data access
- **Queue-Based Processing**: Background jobs for resource-intensive operations
- **RESTful API**: Standard HTTP methods and status codes with consistent response format

### Testing Strategy
- **Backend**: Unit tests for business logic, integration tests for API endpoints
- **Frontend**: Component testing with React Testing Library, user interaction testing
- **Coverage**: Minimum 80% code coverage requirement
- **Test Environment**: Separate test database configuration with pg-mem for isolation
- **CI/CD**: Automated testing in GitHub Actions workflow
- **Test Data**: Mock data and fixtures for consistent testing

### Git Workflow
- **Main Branch**: `main` for production-ready code
- **Development**: Feature branches with descriptive names (e.g., `feature/content-scheduler`)
- **Commit Convention**: Conventional Commits format (`type: description`)
- **Pull Requests**: Code review required before merging to main
- **Tags**: Semantic versioning for releases (v1.0.0, v1.1.0, etc.)

## Domain Context

### GEO Optimization Specifics
- **Local SEO**: Focus on geographic keywords and location-based content optimization
- **Content Strategy**: AI-assisted content generation tailored for specific geographic regions
- **Analytics**: Performance metrics for keyword rankings, content engagement, and geographic targeting
- **Multi-tenant Architecture**: Support for multiple clients/organizations with data isolation

### Business Logic
- **Keyword Scoring**: Algorithmic evaluation of keyword relevance and competition
- **Content Rules**: Configurable templates and generation rules for different content types
- **Image Metadata**: Rich tagging and categorization system for image library management
- **User Roles**: Admin, Editor, and Viewer roles with appropriate permission levels

## Important Constraints

### Performance Requirements
- **Response Time**: API responses under 2 seconds for 95th percentile
- **Concurrent Users**: Support for 100+ concurrent users
- **File Upload**: Maximum file size 50MB, supported formats (PDF, DOCX, images)
- **Queue Processing**: Background job completion within 5 minutes for standard operations

### Security Requirements
- **Authentication**: JWT tokens with 24-hour expiration and refresh token mechanism
- **Authorization**: Role-based access control with resource-level permissions
- **Data Privacy**: GDPR-compliant data handling and user consent management
- **Input Validation**: Comprehensive validation for all user inputs to prevent injection attacks
- **Rate Limiting**: API rate limiting to prevent abuse and ensure fair usage

### Scalability Considerations
- **Database**: Optimized queries with proper indexing for large datasets
- **Caching**: Redis caching for frequently accessed data
- **File Storage**: Efficient file management with cleanup processes
- **Load Balancing**: Horizontal scaling capabilities for high-traffic scenarios

## External Dependencies

### Database Services
- **PostgreSQL**: Primary data storage for user data, content, and analytics
- **Redis**: Session storage, caching, and queue management

### Third-Party APIs
- **Render**: Hosting platform for backend deployment
- **Vercel**: Frontend hosting with automatic deployments
- **GitHub Actions**: CI/CD pipeline for automated testing and deployment

### Development Tools
- **Node Package Manager (npm)**: Dependency management and script execution
- **Jest**: Testing framework for both backend and frontend
- **ESLint**: Code quality and consistency checking
- **Prettier**: Code formatting for consistent style

### Monitoring & Logging
- **Winston**: Structured logging with multiple output targets
- **Health Checks**: Comprehensive health monitoring for services and dependencies
- **Error Tracking**: Centralized error logging and alerting system
