## Context
The GEO SaaS system's content generation feature is experiencing a critical issue where tasks are successfully added to the queue but never processed by workers. Users see progress stuck at 10% with "任务已进入队列，等待执行..." message, indicating a disconnect between task queuing and task execution.

### Current Architecture
- **Queue System:** BullMQ with Redis (Upstash cloud service)
- **Worker Process:** Node.js worker processing content generation tasks
- **AI Integration:** Gemini 2.5 Flash model via custom API endpoint
- **Frontend:** React application with polling-based progress tracking

### Problem Analysis
Based on code analysis, the issue stems from:
1. Multiple queue configuration files with inconsistent settings
2. Potential Worker process connectivity issues
3. Insufficient error handling and monitoring
4. Missing health check mechanisms

## Goals / Non-Goals
- **Goals:**
  - Restore reliable content generation queue processing
  - Implement comprehensive monitoring and health checks
  - Ensure robust error handling and recovery mechanisms
  - Maintain backward compatibility with existing APIs
- **Non-Goals:**
  - Complete rewrite of queue system
  - Changes to underlying AI model integration
  - Frontend UI redesign (only error handling improvements)

## Decisions
- **Decision:** Use `queue-fixed.js` as the single source of truth for queue configuration
  - **Rationale:** `queue-fixed.js` has better error handling and Redis connection management
  - **Alternatives considered:** Merge configurations into a single file, create new unified config
  - **Trade-offs:** Minimal code changes vs. configuration consolidation

- **Decision:** Add health check endpoints for monitoring queue and worker status
  - **Rationale:** Enables proactive monitoring and debugging of queue system health
  - **Alternatives:** External monitoring service, log-based monitoring
  - **Trade-offs:** Additional API surface vs. operational visibility

- **Decision:** Implement graceful fallback mechanisms
  - **Rationale:** Prevents complete service failure during worker or AI service issues
  - **Alternatives:** Strict failure modes, retry-only approaches
  - **Trade-offs:** Complex fallback logic vs. improved user experience

## Risks / Trade-offs
- **Risk:** Redis connection configuration changes may affect other queue consumers
  - **Mitigation:** Thorough testing in staging environment, gradual rollout
- **Risk:** Worker process restart may cause in-flight tasks to be lost
  - **Mitigation:** Implement task recovery mechanisms, proper queue cleanup
- **Risk:** Additional monitoring endpoints may increase attack surface
  - **Mitigation:** Secure endpoints with authentication, rate limiting
- **Trade-off:** Increased code complexity vs. improved reliability and observability

## Migration Plan
1. **Phase 1 (Immediate):** Fix queue configuration consistency
   - Update worker.js import statement
   - Verify Redis connection parameters
   - Deploy configuration fix

2. **Phase 2 (Short-term):** Add monitoring and health checks
   - Implement health check endpoints
   - Add comprehensive logging
   - Deploy monitoring enhancements

3. **Phase 3 (Medium-term):** Enhance error handling and recovery
   - Implement fallback mechanisms
   - Add retry logic with exponential backoff
   - Deploy reliability improvements

## Rollback Plan
- **Configuration Changes:** Revert worker.js import statement to previous configuration
- **Health Check Endpoints:** Remove new endpoints if they cause issues
- **Monitoring Enhancements:** Disable additional logging if performance impact is significant
- **Fallback Mechanisms:** Disable fallback features if they introduce instability

## Open Questions
- Should we implement queue processing timeout detection and automatic recovery?
- Do we need to migrate existing queued tasks during configuration changes?
- Should we implement circuit breaker pattern for AI service calls?
- What are the SLA requirements for queue processing latency?

## Testing Strategy
- **Unit Tests:** Test queue configuration loading and Redis connection
- **Integration Tests:** Test worker task processing end-to-end
- **Load Tests:** Verify queue performance under concurrent load
- **Failure Scenarios:** Test behavior during Redis outages, AI service failures
- **Security Tests:** Verify health check endpoint security measures