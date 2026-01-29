# RareGen Server - Production Roadmap

**Last Updated:** January 29, 2026  
**Current Environment:** Production (api.raregeneration.me:3000)  
**Current Phase:** Container A Complete → Moving to Production Hardening

---

## 🎯 Current State (January 2026)

### ✅ Completed
- **Container A (Publisher)** - Fully operational
  - TypeScript + Fastify API (5 endpoints)
  - BullMQ + Redis queue processing
  - PostgreSQL with atomic UTXO locking
  - RFC 8785 JCS canonicalization
  - ECDSA signature verification
  - Non-custodial architecture
  - OP_RETURN publishing to BSV
- **Infrastructure**
  - Production deployment (167.99.179.216)
  - Docker + docker-compose orchestration
  - DNS configured (api.raregeneration.me)
  - Database initialized (5.8M sats funded)
  - DO Spaces integration configured
  - Email service configured (Nodemailer)
- **Documentation**
  - 8 comprehensive docs (2,820 lines)
  - Architecture, implementation, API guides

### ⚠️ Current Limitations
- HTTP only (no SSL/TLS) - **SECURITY RISK**
- Port 3000 exposed in URL - not production-grade
- No reverse proxy - single point of failure
- No monitoring/alerting
- No rate limiting (beyond basic validation)
- No automated testing
- Container B (Identity/Wallet) not implemented

---

## 🚀 Phase 1: Production Hardening (Week 1-2)
**Priority: CRITICAL** | **Timeline: 1-2 weeks**

### 1.1 SSL/TLS Implementation (Days 1-2)
**Goal:** Secure all traffic with HTTPS

**Tasks:**
- [ ] Install Certbot on droplet
  ```bash
  apt update && apt install certbot python3-certbot-nginx
  ```
- [ ] Generate Let's Encrypt certificate
  ```bash
  certbot certonly --standalone -d api.raregeneration.me
  ```
- [ ] Configure certificate auto-renewal
- [ ] Test SSL certificate validity
- [ ] Update API_BASE_URL to `https://api.raregeneration.me`

**Success Criteria:**
- API accessible via HTTPS
- Valid SSL certificate (A+ rating on SSL Labs)
- HTTP → HTTPS redirect working

---

### 1.2 Nginx Reverse Proxy (Days 3-4)
**Goal:** Professional routing without exposed ports

**Tasks:**
- [ ] Install nginx
  ```bash
  apt install nginx
  ```
- [ ] Create nginx configuration (`/etc/nginx/sites-available/raregen`)
  ```nginx
  server {
    listen 80;
    server_name api.raregeneration.me;
    return 301 https://$server_name$request_uri;
  }
  
  server {
    listen 443 ssl http2;
    server_name api.raregeneration.me;
    
    ssl_certificate /etc/letsencrypt/live/api.raregeneration.me/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.raregeneration.me/privkey.pem;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=10r/s;
    limit_req zone=api_limit burst=20 nodelay;
    
    location / {
      proxy_pass http://localhost:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection 'upgrade';
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_cache_bypass $http_upgrade;
    }
    
    # Health check endpoint
    location /health {
      proxy_pass http://localhost:3000/health;
      access_log off;
    }
  }
  ```
- [ ] Enable site and restart nginx
- [ ] Test routing: https://api.raregeneration.me (no port)
- [ ] Update docker-compose to bind localhost only
  ```yaml
  ports:
    - "127.0.0.1:3000:3000"
  ```

**Success Criteria:**
- API accessible at https://api.raregeneration.me (no port)
- All HTTP requests redirect to HTTPS
- Rate limiting active (10 req/s with 20 burst)
- Security headers present

---

### 1.3 Monitoring & Alerting (Days 5-7)
**Goal:** Real-time visibility into system health

**Tasks:**
- [ ] Set up Prometheus + Grafana stack
  - Add to docker-compose.yml
  - Configure metrics scraping
- [ ] Create custom metrics in Fastify
  ```typescript
  // src/metrics.ts
  import { register, Counter, Histogram, Gauge } from 'prom-client';
  
  export const publishCounter = new Counter({
    name: 'publish_requests_total',
    help: 'Total publish requests',
    labelNames: ['status']
  });
  
  export const utxoGauge = new Gauge({
    name: 'available_utxos_count',
    help: 'Number of available UTXOs'
  });
  
  export const jobDuration = new Histogram({
    name: 'job_duration_seconds',
    help: 'Job processing duration'
  });
  ```
- [ ] Add GET /metrics endpoint
- [ ] Configure Grafana dashboards
  - Request rate, error rate, latency (RED metrics)
  - UTXO availability
  - Queue depth
  - Database connections
- [ ] Set up alerting rules
  - API down > 1 minute
  - Error rate > 5%
  - Available UTXOs < 3
  - Queue depth > 100 jobs
  - Database connections > 80%
- [ ] Configure alert notifications (email via existing Nodemailer)
- [ ] Set up log aggregation (Docker logs → persistent storage)

**Success Criteria:**
- Metrics visible in Grafana
- Alerts triggering correctly
- Email notifications working
- 7-day log retention

---

### 1.4 Database Backup Strategy (Days 8-9)
**Goal:** Zero data loss on failure

**Tasks:**
- [ ] Configure automated PostgreSQL backups
  ```bash
  # Daily backup cron job
  0 2 * * * docker exec raregen_postgres_1 pg_dump -U postgres raregen | gzip > /backup/raregen_$(date +\%Y\%m\%d).sql.gz
  ```
- [ ] Upload backups to DO Spaces
  ```bash
  # Install s3cmd
  apt install s3cmd
  # Configure DO Spaces endpoint
  s3cmd --configure
  # Sync backups
  s3cmd sync /backup/ s3://codenlighten/raregen/backups/
  ```
- [ ] Test restore procedure
- [ ] Document disaster recovery process
- [ ] Set backup retention policy (30 days)

**Success Criteria:**
- Daily automated backups
- Backups uploaded to DO Spaces
- Successful restore test completed
- Recovery documentation written

---

### 1.5 Security Hardening (Days 10-12)
**Goal:** Minimize attack surface

**Tasks:**
- [ ] Enable UFW firewall
  ```bash
  ufw allow 22/tcp    # SSH
  ufw allow 80/tcp    # HTTP
  ufw allow 443/tcp   # HTTPS
  ufw enable
  ```
- [ ] Configure fail2ban for SSH protection
- [ ] Disable root SSH login (use sudo user)
- [ ] Set up automatic security updates
  ```bash
  apt install unattended-upgrades
  dpkg-reconfigure -plow unattended-upgrades
  ```
- [ ] Audit Docker container security
  - Run containers as non-root user
  - Set memory/CPU limits
  - Enable read-only root filesystem where possible
- [ ] Implement request validation hardening
  - Add max payload size limits
  - Enhance input sanitization
  - Add CORS restrictions
- [ ] Environment variable security
  - Verify .env permissions (600)
  - Audit sensitive data exposure in logs
- [ ] Penetration testing
  - Run basic security scan (nmap, OWASP ZAP)
  - Fix identified vulnerabilities

**Success Criteria:**
- Firewall active with minimal open ports
- SSH brute force protection enabled
- Containers running with security best practices
- No critical vulnerabilities in security scan

---

### 1.6 First Live Transaction Test (Days 13-14)
**Goal:** Validate end-to-end publishing flow in production

**Tasks:**
- [ ] Create test client script
  ```typescript
  // test-publish.ts
  import { PrivateKey, PublicKey } from '@smartledger/bsv';
  import axios from 'axios';
  
  const privKey = PrivateKey.fromWIF('test_key_here');
  const pubKey = privKey.toPublicKey();
  
  const intent = {
    signerInfo: { pubkey: pubKey.toString() },
    nonce: Date.now().toString(),
    timestamp: Date.now(),
    record: {
      recordId: 'TEST-001',
      rightsType: 'streaming',
      owners: [{ entityName: 'Test Publisher', share: 100 }],
      territories: ['US'],
      terms: { startDate: '2026-01-01', endDate: '2026-12-31' }
    }
  };
  
  // Sign intent
  const hash = hashJSON(intent);
  const sig = privKey.sign(Buffer.from(hash, 'hex'));
  
  // Submit
  const response = await axios.post('https://api.raregeneration.me/v1/publish', {
    ...intent,
    signature: { r: sig.r.toString('hex'), s: sig.s.toString('hex') }
  });
  
  console.log('Job ID:', response.data.jobId);
  ```
- [ ] Execute test publish
- [ ] Monitor worker logs for processing
- [ ] Verify transaction broadcast
- [ ] Check txid on whatsonchain.com
- [ ] Verify job status updates
- [ ] Query published record via API
- [ ] Document test results

**Success Criteria:**
- Test transaction published successfully
- TXID visible on blockchain explorer
- Job status reflects completion
- Record retrievable via API
- No errors in logs

---

## 🏗️ Phase 2: Container B Implementation (Weeks 3-6)
**Priority: HIGH** | **Timeline: 3-4 weeks**

### 2.1 Identity & Registration Service with Shamir Secret Sharing (Week 3)
**Goal:** User registration with secure non-custodial key management

**Components:**
- [ ] **Shamir Secret Sharing Key Generation**
  - Generate 3 keypairs: identity (signing), financial (earnings), tokens (credits)
  - Split each private key into 5 Shamir shares (3-of-5 threshold recovery)
  - Implement using `@smartledger/bsv` Shamir crypto module
  ```typescript
  import { PrivateKey, ShamirSecret } from '@smartledger/bsv';
  
  // Generate 3 keypairs
  const identityKey = PrivateKey.fromRandom();
  const financialKey = PrivateKey.fromRandom();
  const tokensKey = PrivateKey.fromRandom();
  
  // Split each into 5 shares (need 3 to recover)
  const identityShares = ShamirSecret.split(identityKey.toWIF(), 3, 5);
  const financialShares = ShamirSecret.split(financialKey.toWIF(), 3, 5);
  const tokensShares = ShamirSecret.split(tokensKey.toWIF(), 3, 5);
  ```

- [ ] **5-Share Backup Distribution System**
  - **Share 1**: User downloads JSON file (keys.json)
  - **Share 2**: User prints recovery sheet with QR codes
  - **Share 3**: Encrypted with user password, stored in database
  - **Share 4**: Encrypted with user password, stored in DO Spaces backup
  - **Share 5**: Encrypted and emailed to user's verified email
  
- [ ] **User Registration API**
  ```typescript
  POST /v1/auth/register
  {
    "email": "user@example.com",
    "name": "Publisher Name",
    "organization": "Rights Holder LLC",
    "password": "user_chosen_password"  // for encrypting shares 3,4,5
  }
  
  Response:
  {
    "userId": "uuid",
    "shares": {
      "download": {
        "identity": ["share1_base64"],
        "financial": ["share1_base64"],
        "tokens": ["share1_base64"]
      },
      "print": {
        "identity": ["share2_base64"],
        "financial": ["share2_base64"],
        "tokens": ["share2_base64"],
        "qrCodes": ["data:image/png;base64,..."]
      }
    },
    "publicKeys": {
      "identity": "03abc...",
      "financial": "02def...",
      "tokens": "02ghi..."
    }
  }
  ```

- [ ] **Encrypted Share Storage**
  ```typescript
  // Encrypt shares 3, 4, 5 with user password
  import { Cipher } from '@smartledger/bsv';
  
  const encrypted = Cipher.encrypt(
    share3,
    userPassword,
    { algorithm: 'aes-256-gcm' }
  );
  ```

- [ ] **Email OTP verification**
- [ ] **Key Recovery Flow**
  ```typescript
  POST /v1/auth/recover
  {
    "email": "user@example.com",
    "password": "user_password",  // to decrypt shares 3,4,5
    "otpCode": "123456"
  }
  
  Response:
  {
    "shares": {
      "database": ["share3_base64"],
      "spaces": ["share4_base64"],
      "email": ["share5_base64"]
    }
  }
  
  // Client reconstructs keys
  const recoveredWIF = ShamirSecret.combine([share3, share4, share5]);
  const recoveredKey = PrivateKey.fromWIF(recoveredWIF);
  ```

- [ ] **Database Schema Updates**
  ```sql
  CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    organization VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,  -- bcrypt for share encryption
    status VARCHAR(50) DEFAULT 'pending',
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE user_keys (
    key_id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    key_type VARCHAR(20) NOT NULL,  -- 'identity', 'financial', 'tokens'
    pubkey_hex VARCHAR(66) UNIQUE,
    address VARCHAR(64),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, key_type)
  );
  
  CREATE TABLE key_backups (
    backup_id UUID PRIMARY KEY,
    key_id UUID REFERENCES user_keys(key_id),
    share_number INTEGER,  -- 3, 4, or 5
    share_encrypted TEXT,  -- encrypted with user password
    storage_location VARCHAR(50),  -- 'database', 'spaces', 'email'
    created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE otp_codes (
    otp_id UUID PRIMARY KEY,
    email VARCHAR(255),
    code VARCHAR(6),
    purpose VARCHAR(50),  -- 'registration', 'recovery', 'login'
    expires_at TIMESTAMP,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  
  CREATE TABLE recovery_attempts (
    attempt_id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    success BOOLEAN,
    shares_used TEXT[],
    ip_address INET,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```

- [ ] **Frontend Components** (Lion Rasta Theme)
  - Registration wizard with password setup
  - Key generation loading screen (animated lion with rasta-colored mane)
  - Share download button (JSON + printable PDF with lion branding)
  - Recovery flow with email OTP
  - "Test Recovery" flow (verify user can recover before using)
  - **Design System:** Dark theme with rasta colors (red #E8222E, gold #FFC627, green #009E60)
  - **Branding:** Lion mascot representing strength + freedom
  - **See:** [DESIGN.md](DESIGN.md) for complete brand guidelines

**Success Criteria:**
- Users register with email + password
- 3 keypairs generated client-side or server-side
- 5 Shamir shares created for each key
- Shares distributed: download, print, DB (encrypted), Spaces (encrypted), email
- Users can recover keys with any 3 shares
- OTP codes sent and verified
- Email templates professional and branded
- Recovery attempts logged for security audit
- **Critical**: Test recovery flow works before user publishes first transaction

---

### 2.2 Subscription & Credits System (Week 4)
**Goal:** Monetization and usage tracking

**Components:**
- [ ] Subscription plans database
  ```sql
  CREATE TABLE subscription_plans (
    plan_id UUID PRIMARY KEY,
    name VARCHAR(100),
    price_usd DECIMAL(10,2),
    credits_per_month INTEGER,
    max_records INTEGER,
    features JSONB
  );
  
  CREATE TABLE user_subscriptions (
    subscription_id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    plan_id UUID REFERENCES subscription_plans(plan_id),
    status VARCHAR(50),
    credits_remaining INTEGER,
    renewal_date TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```
- [ ] Credit deduction on publish
- [ ] Subscription management API
  ```typescript
  GET /v1/subscription/status
  POST /v1/subscription/upgrade
  GET /v1/subscription/usage
  ```
- [ ] Payment integration (Stripe or BTCPay Server)
- [ ] Invoice generation
- [ ] Usage analytics dashboard

**Success Criteria:**
- Multiple subscription tiers defined
- Credits deducted per transaction
- Payment processing working
- Usage tracking accurate

---

### 2.3 Wallet & Transaction History (Week 5)
**Goal:** User-facing transaction dashboard with key management

**Components:**
- [ ] **Key Management Dashboard**
  - Display all 3 public keys (identity, financial, tokens)
  - Show addresses for receiving payments
  - QR codes for each address
  - Key backup status indicator (✅ all 5 shares distributed)
  - Re-download shares button
  - Re-send email share button
  - Test recovery flow button
  
- [ ] **Transaction History API**
  ```typescript
  GET /v1/wallet/transactions?limit=50&offset=0
  GET /v1/wallet/transaction/:txid
  ```
  
- [ ] **Published Records Dashboard**
  ```typescript
  GET /v1/wallet/records?status=published&limit=20
  ```
  
- [ ] **Multi-Key Balance Tracking**
  - Identity key: Transaction count, total bytes anchored
  - Financial key: Satoshis received, USD equivalent
  - Tokens key: Credits remaining, subscription status
  
- [ ] **Share Management Interface**
  - View backup locations (which shares are stored where)
  - Test recovery without consuming OTP
  - Rotate keys (generate new, migrate records)
  - Export all data (GDPR compliance)
  
- [ ] **UTXO Management Interface**
- [ ] **Export Functionality** (CSV, JSON)
- [ ] **Transaction Receipts** (PDF generation with branding)

**Success Criteria:**
- Complete transaction history visible
- All 3 keypairs displayed with addresses
- Backup status clear (✅ 5/5 shares secured)
- Real-time status updates
- Export working in multiple formats
- Professional receipts generated
- Test recovery accessible without risk

---

### 2.4 API Key Management (Week 6)
**Goal:** Programmatic access for developers

**Components:**
- [ ] API key generation
  ```typescript
  POST /v1/apikeys/create
  {
    "label": "Production API",
    "scopes": ["publish", "read"]
  }
  ```
- [ ] API key authentication middleware
- [ ] Rate limiting per API key
- [ ] Key rotation/revocation
- [ ] Usage statistics per key
- [ ] Database schema
  ```sql
  CREATE TABLE api_keys (
    key_id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(user_id),
    key_hash VARCHAR(64),
    label VARCHAR(100),
    scopes TEXT[],
    rate_limit INTEGER DEFAULT 100,
    last_used TIMESTAMP,
    expires_at TIMESTAMP,
    revoked BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
  );
  ```

**Success Criteria:**
- API keys generated and hashed securely
- Authentication working with Bearer tokens
- Rate limits enforced per key
- Revocation immediate

---

## ⚡ Phase 3: Advanced Features (Weeks 7-10)
**Priority: MEDIUM** | **Timeline: 3-4 weeks**

### 3.1 Batch Publishing Optimization (Week 7)
**Goal:** 500 transactions per 3 seconds

**Implementation:**
- [ ] Batch aggregation window (5 seconds)
- [ ] Multi-input UTXO transactions
- [ ] Parallel transaction building
- [ ] Optimized fee calculation
- [ ] Enhanced worker logic
  ```typescript
  // Aggregate jobs into batches
  const batch = await aggregateJobsInWindow(5000, 500);
  
  // Build multi-output transaction
  const tx = new Transaction();
  batch.forEach(job => {
    tx.addOutput(buildOpReturn(job.record), 0);
  });
  
  // Broadcast single transaction
  const txid = await broadcastTx(tx);
  
  // Update all jobs with same txid, different vout
  ```
- [ ] Batch status tracking
- [ ] Performance benchmarking

**Success Criteria:**
- 500 records published in single transaction
- < 3 second batch window
- Fee optimization vs individual tx
- Throughput: 500+ tx/3s sustained

---

### 3.2 Rate Limiting & Quotas (Week 8)
**Goal:** Fair usage and DDoS protection

**Implementation:**
- [ ] Redis-based rate limiter
  ```typescript
  import { RateLimiterRedis } from 'rate-limiter-flexible';
  
  const rateLimiter = new RateLimiterRedis({
    storeClient: redisClient,
    points: 100,        // 100 requests
    duration: 60,       // per 60 seconds
    blockDuration: 300  // block for 5 minutes if exceeded
  });
  ```
- [ ] Multi-tier rate limits
  - Free tier: 10 req/min
  - Basic: 100 req/min
  - Pro: 500 req/min
  - Enterprise: unlimited
- [ ] Quota enforcement
- [ ] Rate limit headers
  ```
  X-RateLimit-Limit: 100
  X-RateLimit-Remaining: 87
  X-RateLimit-Reset: 1643567890
  ```
- [ ] Upgrade prompts when limit hit

**Success Criteria:**
- Rate limits enforced per user/API key
- Graceful degradation with 429 responses
- Headers inform client of limits
- Blocked IPs tracked in audit log

---

### 3.3 1Sat Ordinals Support (Week 9)
**Goal:** NFT-style rights tokens

**Implementation:**
- [ ] Ordinal inscription logic
- [ ] UTXO tagging system
- [ ] Inscription data format
  ```json
  {
    "p": "sl-drm-ordinal",
    "v": 1,
    "recordId": "REC-123",
    "contentType": "application/json",
    "content": "{...rights data...}"
  }
  ```
- [ ] Ownership transfer tracking
- [ ] Marketplace integration hooks
- [ ] Query API for ordinal lookup
  ```typescript
  GET /v1/ordinals/:ordinalId
  GET /v1/ordinals/by-record/:recordId
  ```

**Success Criteria:**
- Rights records inscribed as ordinals
- Ordinals tracked on-chain
- Transfer history queryable
- Compatible with standard ordinal wallets

---

### 3.4 Rights Token Issuance (Week 10)
**Goal:** Tradeable rights tokens (RUN protocol)

**Implementation:**
- [ ] RUN protocol integration (@run/sdk)
- [ ] Token contract deployment
- [ ] Rights token minting
  ```typescript
  class RightsToken extends Jig {
    init(recordId, owner, terms) {
      this.recordId = recordId;
      this.owner = owner;
      this.terms = terms;
    }
    
    transfer(newOwner) {
      this.owner = newOwner;
    }
  }
  ```
- [ ] Token metadata linking
- [ ] Secondary market support
- [ ] Royalty distribution logic

**Success Criteria:**
- Rights tokens minted on BSV
- Transfers recorded on-chain
- Token holders queryable
- Royalties calculated correctly

---

## 🧪 Phase 4: Testing & Quality (Weeks 11-12)
**Priority: HIGH** | **Timeline: 2 weeks**

### 4.1 Automated Test Suite (Week 11)
**Goal:** Comprehensive test coverage

**Implementation:**
- [ ] Unit tests (Jest)
  ```typescript
  // __tests__/crypto.test.ts
  describe('Signature Verification', () => {
    it('should verify valid signatures', async () => {
      const privKey = PrivateKey.fromRandom();
      const pubKey = privKey.toPublicKey();
      const data = { foo: 'bar' };
      const signature = signData(data, privKey);
      expect(verifySignature(data, signature, pubKey.toString())).toBe(true);
    });
  });
  ```
- [ ] Integration tests (Supertest + Fastify)
  ```typescript
  describe('POST /v1/publish', () => {
    it('should accept valid signed intent', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/publish',
        payload: validIntent
      });
      expect(response.statusCode).toBe(202);
      expect(response.json()).toHaveProperty('jobId');
    });
  });
  ```
- [ ] E2E tests (Playwright)
- [ ] Load testing (k6)
  ```javascript
  import http from 'k6/http';
  import { check } from 'k6';
  
  export let options = {
    stages: [
      { duration: '2m', target: 100 },  // ramp up
      { duration: '5m', target: 100 },  // sustained
      { duration: '2m', target: 0 }     // ramp down
    ]
  };
  
  export default function() {
    let res = http.post('https://api.raregeneration.me/v1/publish', payload);
    check(res, { 'status is 202': (r) => r.status === 202 });
  }
  ```
- [ ] Test coverage reporting (>80% target)

**Success Criteria:**
- 80%+ code coverage
- All critical paths tested
- CI/CD pipeline with automated tests
- Load test passes at 100 RPS

---

### 4.2 Performance Optimization (Week 12)
**Goal:** Sub-100ms response times

**Tasks:**
- [ ] Database query optimization
  - Add indexes for common queries
  - Analyze slow queries
  - Implement connection pooling tuning
- [ ] API response caching (Redis)
  ```typescript
  // Cache GET /v1/record/:recordId for 1 hour
  app.get('/v1/record/:recordId', async (req, reply) => {
    const cached = await redis.get(`record:${req.params.recordId}`);
    if (cached) return JSON.parse(cached);
    
    const record = await db.query('SELECT...');
    await redis.setex(`record:${req.params.recordId}`, 3600, JSON.stringify(record));
    return record;
  });
  ```
- [ ] Worker concurrency tuning
- [ ] Fastify optimization
  - Enable HTTP/2
  - Adjust body parser limits
  - Schema compilation
- [ ] CDN for static assets (Cloudflare)
- [ ] Benchmark before/after

**Success Criteria:**
- P50 latency < 50ms
- P95 latency < 100ms
- P99 latency < 200ms
- Throughput > 1000 RPS

---

## 📊 Phase 5: Production Operations (Ongoing)
**Priority: CONTINUOUS** | **Timeline: Ongoing**

### 5.1 Monitoring & Observability
**Continuous Tasks:**
- [ ] Daily health check review
- [ ] Weekly metrics analysis
- [ ] Monthly performance review
- [ ] Error rate tracking
- [ ] Capacity planning

**Metrics to Track:**
- Request rate (per endpoint)
- Error rate (4xx, 5xx)
- Latency percentiles (P50, P95, P99)
- Database performance (query time, connection pool)
- Queue depth and processing time
- UTXO availability
- Disk usage, memory, CPU
- API key usage patterns

---

### 5.2 Incident Response
**Procedures:**
- [ ] Define incident severity levels
  - **P0**: Service down (respond < 15 min)
  - **P1**: Major feature broken (respond < 1 hour)
  - **P2**: Minor bug (respond < 24 hours)
  - **P3**: Enhancement (respond < 7 days)
- [ ] Create runbooks for common issues
  - Database connection failures
  - UTXO pool exhaustion
  - Worker crashes
  - Memory leaks
- [ ] Establish on-call rotation
- [ ] Post-mortem template

---

### 5.3 Maintenance Windows
**Regular Tasks:**
- [ ] Weekly: Review logs for anomalies
- [ ] Monthly: Update dependencies (npm audit fix)
- [ ] Quarterly: Security audit
- [ ] Semi-annually: Database optimization (VACUUM, REINDEX)
- [ ] Annually: Disaster recovery drill

---

## 🎓 Phase 6: Documentation & Developer Experience (Weeks 13-14)
**Priority: MEDIUM** | **Timeline: 2 weeks**

### 6.1 Public API Documentation (Week 13)
**Goal:** OpenAPI/Swagger spec

**Tasks:**
- [ ] Generate OpenAPI 3.0 spec
- [ ] Host Swagger UI at https://api.raregeneration.me/docs
- [ ] Create interactive examples
- [ ] Authentication guide
- [ ] Code samples (JavaScript, Python, cURL)
- [ ] Postman collection
- [ ] Video tutorials

**Success Criteria:**
- Complete API reference published
- All endpoints documented with examples
- SDKs available for major languages

---

### 6.2 Developer Portal (Week 14)
**Goal:** Self-service onboarding

**Components:**
- [ ] Marketing website (raregeneration.me)
- [ ] Developer dashboard (dashboard.raregeneration.me)
- [ ] Pricing page
- [ ] Getting started guide
- [ ] Use case examples
- [ ] FAQ and troubleshooting
- [ ] Community forum or Discord

---

## 📈 Success Metrics

### Technical KPIs
- **Uptime:** 99.9% (max 43 min downtime/month)
- **Latency:** P95 < 100ms
- **Throughput:** 1000+ RPS sustained
- **Error Rate:** < 0.1%
- **Test Coverage:** > 80%

### Business KPIs
- **Registered Users:** Track monthly growth
- **Published Records:** Track daily volume
- **Revenue:** Track MRR (Monthly Recurring Revenue)
- **API Usage:** Track requests per customer
- **Customer Satisfaction:** NPS score

---

## 🚨 Risk Management

### Technical Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| UTXO pool exhaustion | Medium | High | Automated UTXO splitting, monitoring, alerts |
| Database failure | Low | Critical | Daily backups, replica setup, disaster recovery plan |
| DDoS attack | Medium | Medium | Cloudflare, rate limiting, IP blocking |
| Private key compromise | Low | Critical | Hardware wallet, multi-sig, key rotation |
| BSV network congestion | Low | Medium | Fee bumping, transaction priority queue |

### Business Risks
| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Low adoption | Medium | High | Marketing, partnerships, competitive pricing |
| Competitor emerges | Medium | Medium | Feature differentiation, lock-in contracts |
| Regulatory change | Low | High | Legal counsel, compliance monitoring |
| BSV price volatility | High | Medium | USD-denominated pricing, hedging strategy |

---

## 💰 Budget & Resources

### Infrastructure Costs (Monthly)
- **DigitalOcean Droplet** (4 CPU, 8GB RAM): $48/month
- **DigitalOcean Spaces** (250GB): $5/month
- **Domain Registration**: $1/month
- **Email Service** (5000 emails/month): $10/month
- **Monitoring** (Grafana Cloud): $0 (free tier)
- **Total**: ~$65/month

### Personnel Requirements
- **Phase 1-2** (Weeks 1-6): 1 full-stack developer
- **Phase 3-4** (Weeks 7-12): 1 full-stack + 1 QA engineer
- **Phase 5-6** (Weeks 13-14): 1 full-stack + 1 technical writer
- **Ongoing**: 0.5 FTE DevOps/SRE

---

## 🎯 Next Immediate Actions (This Week)

### Priority 1: SSL/TLS (Today)
```bash
# SSH to production
ssh root@167.99.179.216

# Install Certbot
apt update && apt install certbot

# Generate certificate
certbot certonly --standalone -d api.raregeneration.me

# Verify certificate
ls -la /etc/letsencrypt/live/api.raregeneration.me/
```

### Priority 2: Nginx Setup (Tomorrow)
```bash
# Install nginx
apt install nginx

# Configure (see Section 1.2)
nano /etc/nginx/sites-available/raregen

# Enable and test
ln -s /etc/nginx/sites-available/raregen /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

### Priority 3: First Test Transaction (End of Week)
```bash
# Run test script
cd /home/greg/dev/raregen-server
node test-publish.js

# Verify on blockchain
curl https://api.whatsonchain.com/v1/bsv/main/tx/<TXID>
```

---

## 📞 Support & Escalation

### Contact Information
- **Technical Issues:** GitHub Issues (private repo)
- **Security Issues:** security@raregeneration.me (encrypted)
- **Business Inquiries:** info@smartalerts.org
- **Emergency:** [On-call phone number]

### Escalation Path
1. **L1:** Automated monitoring alerts
2. **L2:** On-call engineer (15 min response)
3. **L3:** Senior engineer (1 hour response)
4. **L4:** CTO/Technical Lead (same day)

---

## 📝 Notes

- This roadmap is a living document - update after each milestone
- Dates are estimates and may shift based on priorities
- Security and stability take precedence over features
- Regular stakeholder updates recommended (weekly status reports)
- Consider MVP approach: launch Phase 1-2 before Phase 3-4

**Last Updated:** January 29, 2026  
**Next Review:** February 5, 2026
