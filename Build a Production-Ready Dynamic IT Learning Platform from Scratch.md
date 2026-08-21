# MASTER PROMPT — BUILD THE ENTIRE PLATFORM FROM ZERO

You are acting as a **Senior Software Architect, Senior Full-Stack Engineer, Security Engineer, DevOps Engineer, Database Architect, UX/UI Designer, SEO Specialist, and Code Reviewer**.

Your task is to design and build a complete, production-ready, scalable, secure, modern **Online IT Learning Platform / Web Academy** from absolute zero.

This is **NOT** a simple landing page.

This is a complete ecosystem consisting of:

1. Public Client Website
2. Authentication System
3. Student/User Dashboard
4. Course Learning System
5. Course Catalog
6. Categories and Subcategories
7. Dynamic CMS
8. Fully Dynamic Admin Panel
9. Role & Permission Management
10. User Management
11. Content Management
12. Page Builder / Dynamic Sections
13. Course Editor
14. PDF Import System
15. Rich Content Editor
16. Video Content Support
17. Multi-language System
18. SEO Management
19. Statistics and Learning Progress
20. Optional Dynamic E-Commerce Module
21. Legal Pages
22. Feature/Page Enable/Disable System
23. Security Infrastructure
24. High Performance and Optimization
25. Clean, Scalable Architecture

The visual and product inspiration should feel similar in quality and structure to modern learning platforms such as:

- Cisco Networking Academy
- W3Schools
- Medium-style reading experience
- Modern SaaS dashboards
- Modern IT education platforms

Reference inspiration:

https://www.netacad.com/

Do **NOT** copy the reference website.

Instead, analyze the general product structure, usability, navigation logic, educational experience, and professional feeling, then create an original, modern, premium implementation.

---

# 1. PRIMARY PRODUCT GOAL

Build a complete online learning ecosystem where users can:

- Register
- Login
- Verify their account
- Login using OAuth providers
- Browse courses
- Browse categories
- Browse subcategories
- Search courses
- Enroll in courses
- Continue learning
- Read lessons
- Watch videos
- View rich educational content
- Import/display PDF-based educational content
- Track learning progress
- See completed lessons
- See remaining lessons
- See course completion percentage
- Continue exactly where they stopped
- View learning statistics
- Switch languages
- Manage their profile
- Access legal pages
- Optionally access an E-Commerce section if enabled by administrators

The entire platform must be designed to be **highly dynamic**.

The administrators should be able to control as much of the platform as possible from the Admin Panel without editing source code.

---

# 2. IMPORTANT DEVELOPMENT PHILOSOPHY

Before writing major implementation code:

1. Analyze the entire product.
2. Create a complete architecture plan.
3. Define the database structure.
4. Define entities and relationships.
5. Define API modules.
6. Define frontend architecture.
7. Define admin architecture.
8. Define authentication flow.
9. Define authorization and permissions.
10. Define security boundaries.
11. Define dynamic CMS structure.
12. Define feature flags.
13. Define i18n architecture.
14. Define SEO architecture.
15. Define caching strategy.
16. Define error handling strategy.
17. Define logging strategy.
18. Define testing strategy.

Do not randomly start generating components.

First create a logical implementation plan and project architecture.

Then implement the system in organized phases.

Do not create unnecessary complexity.

Do not overengineer small parts.

However, the architecture must be scalable enough for a real production application with many users, courses, lessons, languages, administrators, and dynamic content.

---

# 3. REQUIRED TECHNOLOGY STACK

Use the following stack unless there is a strong architectural reason to improve a specific choice.

## Frontend

Use:

- Next.js
- Latest stable App Router
- TypeScript
- React
- Tailwind CSS
- Modern accessible UI component architecture
- Zustand only where global client state is genuinely necessary
- TanStack Query for server-state/data fetching where appropriate
- React Hook Form
- Zod validation
- Framer Motion only for meaningful animations
- Lucide icons or equivalent modern icon system

Frontend must use:

- Server Components where beneficial
- Client Components only where interaction requires them
- Proper loading states
- Proper error states
- Empty states
- Skeleton loading
- Optimistic UI only where appropriate
- Proper cache invalidation
- Reusable UI components
- Reusable feature components

Avoid unnecessary prop drilling.

Avoid putting all logic inside giant page components.

---

# 4. BACKEND

Use:

- Node.js
- Express.js
- TypeScript

The backend must have a clean modular architecture.

Recommended structure:

```text
server/
├── src/
│   ├── config/
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── roles/
│   │   ├── permissions/
│   │   ├── courses/
│   │   ├── lessons/
│   │   ├── categories/
│   │   ├── content/
│   │   ├── pages/
│   │   ├── sections/
│   │   ├── media/
│   │   ├── languages/
│   │   ├── translations/
│   │   ├── ecommerce/
│   │   ├── orders/
│   │   ├── products/
│   │   ├── feature-flags/
│   │   ├── seo/
│   │   ├── analytics/
│   │   └── settings/
│   │
│   ├── middleware/
│   ├── lib/
│   ├── utils/
│   ├── constants/
│   ├── types/
│   ├── routes/
│   ├── jobs/
│   ├── events/
│   └── app.ts
│
├── tests/
├── package.json
└── README.md
```

Do not create one giant controllers folder containing everything.

Each module should contain its own:

```text
module/
├── controller
├── service
├── repository
├── routes
├── validation
├── types
└── schema/model
```

Business logic must not live inside route handlers.

Routes should remain thin.

Controllers should remain thin.

Business logic should live in services.

Database logic should be isolated.

Validation must happen before business logic.

---

# 5. DATABASE DECISION

Prefer **PostgreSQL** for this project.

Reason:

The platform contains many strongly related entities:

- Users
- Roles
- Permissions
- Courses
- Categories
- Subcategories
- Lessons
- Enrollments
- Progress
- Orders
- Products
- Pages
- Sections
- Languages
- Translations
- Settings

This is highly relational data.

Use:

- PostgreSQL
- Prisma ORM

The database provider can be:

- Supabase PostgreSQL

or another production PostgreSQL provider.

Do not use MongoDB unless there is a clearly justified reason.

The main relational database architecture should be PostgreSQL.

---

# 6. MONOREPO / PROJECT STRUCTURE

Create a clean workspace structure.

Recommended:

```text
academy-platform/
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── config/
│   └── validation/
│
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── security.md
│   ├── database.md
│   └── development.md
│
├── package.json
├── README.md
└── .env.example
```

Use shared types only where they genuinely make sense.

Do not tightly couple frontend implementation to backend internals.

The API contract should remain explicit and understandable.

---

# 7. PUBLIC WEBSITE

The public website must be premium, modern, clean, fast, and highly responsive.

It must not feel like a basic template.

The design should feel like a combination of:

- Modern learning platform
- Medium reading experience
- W3Schools usability
- Premium SaaS product
- Modern technology academy

Possible public pages:

```text
/
about
courses
courses/[slug]
categories
categories/[slug]
search
instructors
blog
blog/[slug]
contact
faq
privacy-policy
terms-of-service
cookie-policy
accessibility
shop
shop/[slug]
cart
checkout
login
register
forgot-password
reset-password
verify-account
```

The actual pages must be dynamically configurable.

Administrators must be able to enable or disable pages.

For example:

```text
Shop: ENABLED / DISABLED
Blog: ENABLED / DISABLED
Instructors: ENABLED / DISABLED
FAQ: ENABLED / DISABLED
```

When a feature is disabled:

- Hide navigation links automatically
- Block public routes
- Return appropriate response or 404/feature unavailable page
- Do not leave broken links

---

# 8. DYNAMIC NAVIGATION SYSTEM

The navigation must be completely dynamic.

Administrators must be able to:

- Add menu items
- Edit menu items
- Delete menu items
- Reorder menu items
- Create nested menus
- Create submenus
- Change URLs
- Select internal/external links
- Enable/disable menu items
- Configure visibility by role
- Configure visibility by language
- Add icons if supported

Example:

```text
Courses
├── Frontend Development
│   ├── React
│   ├── Next.js
│   └── JavaScript
│
├── Backend Development
│   ├── Node.js
│   ├── Express.js
│   └── Databases
│
└── DevOps
    ├── Docker
    ├── CI/CD
    └── Cloud
```

Menu ordering should support drag-and-drop in the Admin Panel.

Do not hardcode navigation in frontend components.

---

# 9. FULL DYNAMIC CMS

The website must have a CMS-like architecture.

Administrators should be able to manage content without changing code.

They must be able to:

- Create pages
- Edit pages
- Delete pages
- Publish/unpublish pages
- Enable/disable pages
- Configure SEO metadata
- Add sections
- Delete sections
- Edit sections
- Reorder sections
- Duplicate sections
- Hide/show sections

Each page should support multiple dynamic sections.

Possible section types:

```text
Hero
Text
Rich Text
Image
Image + Text
Feature Grid
Course Grid
Category Grid
Statistics
Testimonials
FAQ
CTA
Carousel
Logo Carousel
Video
Newsletter
Team
Instructor List
Blog Grid
Custom HTML only if safely sanitized
```

Example page configuration:

```text
Home Page
├── Hero Section
├── Popular Courses
├── Categories
├── Statistics
├── Why Learn With Us
├── Testimonials
├── Latest Articles
└── CTA
```

Admin must be able to change the order of sections using drag-and-drop.

---

# 10. PAGE BUILDER PRINCIPLE

Do not build a dangerous unrestricted page builder.

Instead build a controlled component-based page builder.

Each section should have:

```text
type
settings
content
visibility
order
translations
status
```

Example:

```ts
{
  type: "hero",
  order: 1,
  isVisible: true,
  content: {
    title: "Learn IT Skills",
    description: "...",
    buttonText: "Start Learning"
  }
}
```

Frontend should render sections through a registry.

Example:

```text
SectionRenderer
├── HeroSection
├── FeatureGridSection
├── CourseGridSection
├── StatsSection
└── CTASection
```

Do not create giant conditional rendering logic inside pages.

Use a clean section registry pattern.

---

# 11. COURSE SYSTEM

The course system is one of the core features.

Administrators must be able to:

- Create courses
- Edit courses
- Delete courses
- Archive courses
- Publish/unpublish courses
- Duplicate courses
- Add thumbnails
- Upload images
- Configure categories
- Configure subcategories
- Configure difficulty level
- Add instructors
- Add tags
- Add estimated duration
- Add prerequisites
- Add learning outcomes
- Configure SEO metadata

A course structure may be:

```text
Course
├── Module
│   ├── Lesson
│   │   ├── Text Content
│   │   ├── Video
│   │   ├── Images
│   │   ├── Code Examples
│   │   ├── PDF Content
│   │   └── Additional Resources
│
├── Module
│   ├── Lesson
│   └── Lesson
```

Administrators must be able to reorder:

- Courses
- Modules
- Lessons
- Content blocks

Use a clear `sortOrder` / position strategy.

---

# 12. COURSE CATEGORIES

Admin must be able to manage:

```text
Category
└── Subcategory
    └── Course
```

For example:

```text
Programming
├── Frontend
│   ├── React Course
│   ├── Next.js Course
│   └── JavaScript Course
│
└── Backend
    ├── Node.js
    ├── Express.js
    └── PostgreSQL
```

Administrators must be able to:

- Create categories
- Edit categories
- Delete categories
- Disable categories
- Add images
- Add icons
- Add descriptions
- Configure SEO
- Change order
- Create subcategories
- Assign courses

Categories must not be hardcoded.

---

# 13. COURSE LEARNING EXPERIENCE

The learning interface must be extremely usable.

Suggested layout:

```text
------------------------------------------------
Header
------------------------------------------------

Sidebar                 Main Content

Course Modules          Lesson Title
├ Module 1              Description
│ ├ Lesson 1
│ ├ Lesson 2            Video / Content
│ └ Lesson 3
│
├ Module 2              Rich educational content
│ ├ Lesson 1
│ └ Lesson 2
│
└ Module 3              Previous / Next buttons

------------------------------------------------
Progress information
------------------------------------------------
```

The user must be able to:

- Expand/collapse modules
- Navigate lessons
- Mark lessons complete
- Automatically save progress
- Continue where they stopped
- View completed lessons
- View remaining lessons
- See progress percentage

Progress must be stored server-side.

Do not rely only on localStorage.

---

# 14. MEDIUM-STYLE CONTENT EXPERIENCE

Lesson reading pages should have a premium reading experience inspired by Medium.

Requirements:

- Comfortable line length
- Proper typography
- Good spacing
- Responsive text
- Images inside content
- Videos inside content
- Code blocks
- Headings
- Lists
- Quotes
- Tables
- Callouts
- Links
- Embedded resources

The content should feel like a real educational article, not a plain document viewer.

Avoid displaying educational content as an A4 document unless the user explicitly downloads the original PDF.

---

# 15. RICH CONTENT EDITOR

The Admin Panel must provide a powerful content editor.

The editor should support:

- Headings
- Paragraphs
- Bold
- Italic
- Underline
- Strike-through
- Lists
- Ordered lists
- Links
- Images
- Videos
- Code blocks
- Quotes
- Tables
- Dividers
- Callouts
- Embedded resources

Use a structured rich-text format instead of storing unsafe raw HTML whenever possible.

If HTML support exists:

- Sanitize on input
- Sanitize on output
- Prevent XSS

---

# 16. PDF IMPORT FEATURE

A course lesson must support importing a PDF.

However:

The PDF should not simply appear as an ugly embedded PDF viewer by default.

The system should support a workflow where:

1. Admin uploads/imports a PDF.
2. PDF is processed.
3. Extract useful content.
4. Convert it into structured content where possible.
5. Preserve:
   - Headings
   - Paragraphs
   - Images
   - Lists
   - Basic structure
6. Allow the admin to review and edit the imported content.
7. Render the final lesson inside the website's own learning UI.

The final user experience should feel native to the website.

Do not simply display:

```text
<iframe src="document.pdf">
```

as the main learning experience.

The original PDF may still be available as an optional download.

Design the import system with graceful fallbacks because PDFs can vary significantly in structure.

---

# 17. VIDEO SUPPORT

Lessons should support:

- Uploaded videos
- External video URLs
- Embedded videos where safe
- Video metadata
- Poster images
- Duration
- Progress tracking if technically supported

Use a secure media architecture.

Do not expose sensitive storage credentials.

Media access should be designed properly.

---

# 18. USER AUTHENTICATION

Support:

### Standard Authentication

- Register
- Login
- Logout
- Email verification
- OTP verification where appropriate
- Forgot password
- Reset password
- Change password

### OAuth

Design OAuth architecture to support providers such as:

- Google
- GitHub
- Other providers if added later

The architecture should make providers extensible.

Use secure OAuth flows.

---

# 19. AUTHENTICATION SECURITY

Authentication must follow modern security best practices.

Requirements:

- Password hashing using a strong password hashing algorithm
- Secure password policies
- Rate limiting on login
- Rate limiting on registration
- Rate limiting on password reset
- Rate limiting on OTP verification
- Prevent brute-force attacks
- Secure session/token handling
- Token rotation strategy where appropriate
- Refresh token invalidation
- Logout invalidation
- Password reset token expiration
- Email verification token expiration
- Reuse prevention where appropriate

Do not expose sensitive tokens to JavaScript unnecessarily.

Prefer secure HTTP-only cookies when appropriate.

Configure:

- Secure
- HttpOnly
- SameSite

according to deployment architecture.

---

# 20. IMPORTANT SECURITY REALITY

Do not attempt to "hide API requests from DevTools".

This is not a valid security model.

Any request sent by the browser can potentially be inspected by the user.

Instead, secure the platform through:

- Authentication
- Authorization
- Server-side validation
- Object-level authorization
- Resource ownership checks
- Rate limiting
- Input validation
- Secure cookies/tokens
- HTTPS
- CORS policy
- CSRF protection where applicable
- Security headers
- No sensitive information in responses
- No secrets in frontend code
- No internal implementation details unnecessarily exposed
- Proper logging and monitoring

Never rely on:

- Obfuscation
- Encoding
- Minification
- Hiding endpoints

as a security mechanism.

Security must be enforced on the server.

---

# 21. AUTHORIZATION

Implement robust authorization.

The backend must verify authorization for every protected action.

Example:

A normal user must never be able to change their request from:

```text
DELETE /users/me
```

to:

```text
DELETE /users/admin-id
```

and successfully delete another user.

All sensitive operations require server-side ownership and permission checks.

---

# 22. ROLE MANAGEMENT

The Admin Panel must include complete role management.

Default roles may include:

```text
Super Admin
Admin
Content Manager
Instructor
Support
Student
```

However, roles must be dynamic.

Administrators must be able to:

- Create roles
- Edit roles
- Delete roles when safe
- Assign permissions
- Remove permissions
- Assign users to roles

Use permissions such as:

```text
users.read
users.create
users.update
users.delete

courses.read
courses.create
courses.update
courses.delete

pages.read
pages.create
pages.update
pages.delete

roles.read
roles.manage

settings.manage
```

Use middleware and/or policy checks.

Do not rely on frontend-only role checks.

Frontend role checks are only for UX.

Backend authorization is the source of truth.

---

# 23. USER MANAGEMENT

The Admin Panel must include a full user management section.

Admin should be able to view:

- User ID
- Name
- Email
- Avatar
- Registration date
- Last login
- Role
- Status
- Verification status
- Enrolled courses
- Progress summary

Admin actions:

- Search users
- Filter users
- Sort users
- View details
- Edit users
- Change roles
- Activate users
- Deactivate users
- Delete users according to policy

Use pagination.

Do not load thousands of users into the browser at once.

---

# 24. USER DASHBOARD

When a user logs in to the public website, they must have their own dashboard.

This is separate from the Admin Panel.

Suggested dashboard:

```text
/dashboard
```

Dashboard sections:

### Overview

Show:

- Welcome section
- Continue learning
- Courses in progress
- Completed courses
- Total lessons completed
- Current learning streak if implemented
- Overall learning statistics

### My Courses

Show:

- Course image
- Course title
- Progress percentage
- Last accessed lesson
- Continue button

### Completed

Show completed courses.

### Profile

Allow users to manage:

- Name
- Avatar
- Password
- Account information
- Preferences
- Language

### Settings

User-level preferences.

---

# 25. LEARNING STATISTICS

The student dashboard must contain meaningful statistics.

For example:

```text
Total Courses: 8
In Progress: 3
Completed: 2
Not Started: 3

Lessons Completed: 47
Total Lessons: 100

Overall Progress: 47%
```

The system should determine:

- Which lesson was last opened
- Which lesson was last completed
- Course progress
- Module progress
- Completed courses

Progress calculations must happen reliably.

Avoid inconsistent client-only calculations.

---

# 26. MULTI-LANGUAGE / I18N

The platform must support:

- Armenian
- English
- Russian
- German
- Spanish
- Italian
- French
- British English

Note:

"British English" should be modeled as a locale variant, for example:

```text
en-US
en-GB
```

rather than treating it as a completely unrelated language.

The i18n system must support:

- UI translations
- Dynamic CMS content
- Course translations
- Page translations
- SEO translations
- Menu translations
- Category translations

The architecture must make adding a new language easy.

Do not hardcode text directly throughout components.

Use a proper translation strategy.

URL strategy should be carefully designed.

Example:

```text
/en/courses
/hy/courses
/ru/courses
/de/courses
```

Or use a well-designed locale strategy suitable for SEO.

---

# 27. LANGUAGE SWITCHER

Create a premium language switcher.

Requirements:

- Flag or locale representation only if appropriate
- Language name
- Accessible controls
- Remember user preference
- Update route/content correctly
- Graceful fallback when translation does not exist

Do not automatically show broken untranslated pages.

---

# 28. ADMIN PANEL

The Admin Panel must be a complete professional CMS/admin system.

Suggested route:

```text
/admin
```

Sections:

```text
Dashboard
Users
Roles
Permissions
Courses
Course Categories
Subcategories
Lessons
Pages
Page Sections
Menus
Media Library
Blog
Languages
Translations
SEO
Feature Management
E-Commerce
Products
Orders
Legal Pages
Settings
Audit Logs
```

The Admin UI must be:

- Clean
- Fast
- Responsive
- Modern
- Easy to understand
- Easy to maintain

Do not make it overly complicated.

---

# 29. ADMIN DASHBOARD

Admin Dashboard should display useful metrics.

Examples:

```text
Total Users
New Users
Active Users
Total Courses
Published Courses
Draft Courses
Total Enrollments
Course Completions
Recent Activity
```

Use proper server-side aggregation.

---

# 30. COURSE ADMINISTRATION

Course management should support:

```text
Course
├── General Information
├── Thumbnail
├── Categories
├── Instructor
├── Difficulty
├── Learning Outcomes
├── Requirements
├── Modules
│   ├── Lessons
│   └── Lesson Content
├── SEO
├── Status
└── Translations
```

Course statuses:

```text
Draft
Published
Archived
Disabled
```

The public website must respect status rules.

---

# 31. MEDIA LIBRARY

Create a media management system.

Admin should be able to:

- Upload images
- Upload PDFs
- Upload supported files
- Upload video references
- View media
- Search media
- Delete unused media where safe
- View metadata

Use cloud storage.

Possible architecture:

- Supabase Storage
- S3-compatible storage

Do not store large media files directly inside PostgreSQL.

Store metadata and references in the database.

---

# 32. E-COMMERCE MODULE

The platform should include an optional E-Commerce system.

Possible products:

- Books
- Merchandise
- Learning materials
- Packages
- Digital products

The E-Commerce module must be feature-flagged.

Admin must be able to disable it.

If disabled:

- Shop pages disappear
- Navigation disappears
- APIs respect feature availability
- Frontend does not show broken functionality

Admin must be able to:

- Create products
- Edit products
- Delete/archive products
- Upload images
- Manage categories
- Manage inventory if physical
- Manage price
- Manage product visibility
- Enable/disable products

Use CRUD architecture.

Design payments as an extensible integration layer.

Do not tightly couple business logic to one payment provider.

---

# 33. FEATURE FLAGS

Create a centralized feature management system.

Example:

```text
BLOG_ENABLED
SHOP_ENABLED
INSTRUCTORS_ENABLED
FAQ_ENABLED
NEWSLETTER_ENABLED
COMMENTS_ENABLED
```

Administrators should be able to enable or disable supported features.

The architecture should support:

- Global enable/disable
- Future role-based feature access if necessary

Feature flags must be checked appropriately.

Frontend hiding alone is not sufficient.

The backend must also enforce feature availability when relevant.

---

# 34. LEGAL PAGES

The platform must support:

- Privacy Policy
- Terms of Service
- Cookie Policy
- User Agreement
- Other legal documents

These pages should also be manageable dynamically where appropriate.

Track versions if users are required to accept updated agreements.

Registration may require:

```text
I agree to the Terms of Service
I agree to the Privacy Policy
```

Store:

- Accepted document version
- Acceptance timestamp

---

# 35. SEO

SEO must be implemented professionally.

Every public page should support:

- Title
- Meta description
- Open Graph metadata
- Twitter metadata where relevant
- Canonical URL
- Robots configuration
- Structured data where appropriate

Support:

- sitemap.xml
- robots.txt
- Dynamic course metadata
- Dynamic blog metadata
- Locale-aware SEO

Courses should have SEO-friendly URLs.

Example:

```text
/courses/react-from-zero-to-advanced
```

Do not use database IDs as the primary public URL.

Use slugs.

Ensure slug uniqueness.

---

# 36. ACCESSIBILITY

Follow modern accessibility practices.

Requirements:

- Semantic HTML
- Keyboard navigation
- Focus states
- ARIA only where necessary
- Accessible forms
- Accessible error messages
- Accessible modal behavior
- Color contrast
- Screen reader-friendly labels

Do not sacrifice accessibility for visual effects.

---

# 37. DESIGN SYSTEM

Use the following primary color palette:

```text
#091540
#1B2CC1
#7692FF
#ABD2FA
#FFFFFF
```

Interpretation:

```text
Primary Dark: #091540
Primary Blue: #1B2CC1
Accent: #7692FF
Light Accent: #ABD2FA
White: #FFFFFF
```

Create semantic design tokens.

Do not scatter raw colors everywhere.

Example:

```css
--color-background
--color-surface
--color-primary
--color-primary-hover
--color-accent
--color-text-primary
--color-text-secondary
--color-border
```

Create:

- Typography scale
- Spacing scale
- Border radius system
- Shadow system
- Transition system

The UI should feel:

- Modern
- Premium
- Technology-focused
- Educational
- Clean
- Friendly

Hover effects should primarily use refined blue accents.

Animations must be:

- Smooth
- Subtle
- Fast
- Purposeful

Avoid excessive animation.

---

# 38. RESPONSIVE DESIGN

The entire application must work perfectly on:

- Mobile
- Tablet
- Laptop
- Desktop
- Large screens

Do not treat mobile as an afterthought.

Design responsive behavior intentionally.

Navigation, course sidebar, tables, admin layouts, and dashboards must adapt properly.

---

# 39. PERFORMANCE

The website must be optimized for speed.

Use:

- Next.js optimization features
- Image optimization
- Lazy loading
- Code splitting
- Route-level loading
- Caching
- Pagination
- Cursor pagination where beneficial
- Server-side filtering
- Avoid unnecessary client-side rendering

Do not fetch large datasets unnecessarily.

Avoid:

```text
SELECT *
```

style logic when only specific fields are needed.

Implement database indexes where appropriate.

Document important indexes.

---

# 40. API DESIGN

Use a consistent API structure.

Example:

```text
/api/v1/auth
/api/v1/users
/api/v1/courses
/api/v1/categories
/api/v1/pages
/api/v1/sections
/api/v1/media
/api/v1/settings
```

Use:

- Proper HTTP methods
- Correct status codes
- Consistent error response structure
- Pagination
- Filtering
- Sorting
- Search

Example error:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "fields": {}
  }
}
```

Do not leak:

- Stack traces
- Database errors
- Secrets
- Internal implementation details

in production responses.

---

# 41. VALIDATION

Validate all input on the server.

Use schema validation.

Validate:

- Request body
- Query parameters
- Route parameters
- File metadata
- Pagination values
- Sorting values
- Filters

Frontend validation is useful for UX.

Backend validation is mandatory for security.

Never trust client input.

---

# 42. FILE UPLOAD SECURITY

File uploads must be secured.

Requirements:

- File size limits
- Allowed MIME types
- Validate file signatures where possible
- Generate server-side filenames
- Do not trust original file names
- Prevent dangerous uploads
- Store files outside executable public paths when applicable
- Scan or integrate scanning architecture where production requirements justify it

Never assume:

```text
Content-Type: image/png
```

means the file is actually safe.

---

# 43. SECURITY LAYERS

Implement a security baseline including:

- HTTPS in production
- Helmet/security headers
- CSP strategy
- CORS configuration
- Rate limiting
- Input validation
- Output encoding
- XSS prevention
- SQL injection prevention through parameterized ORM usage
- CSRF protection when applicable
- Secure cookies
- Authentication middleware
- Authorization middleware
- Object-level authorization
- Audit logs for sensitive actions
- Secure environment variables
- No secrets committed to Git
- Dependency review
- Error handling

Security must be layered.

There is no such thing as a system that is magically impossible to hack.

The goal is to reduce attack surface, prevent common vulnerabilities, protect data, detect suspicious activity, and recover safely.

---

# 44. AUDIT LOGS

Sensitive admin actions should be auditable.

Examples:

- User deleted
- User role changed
- Course published
- Course deleted
- Settings changed
- Feature enabled/disabled
- Admin created

Store:

```text
Actor
Action
Target
Timestamp
Relevant metadata
```

Do not store sensitive secrets inside audit logs.

---

# 45. ERROR HANDLING

Implement centralized error handling.

Create custom error classes where useful.

Example:

```text
ValidationError
AuthenticationError
AuthorizationError
NotFoundError
ConflictError
RateLimitError
```

Return consistent API responses.

Frontend should have:

- Error boundaries where appropriate
- Retry behavior where appropriate
- User-friendly error messages

---

# 46. LOGGING

Implement structured logging.

Separate:

- Development logs
- Production logs
- Error logs
- Security-related events

Never log:

- Passwords
- Raw tokens
- Sensitive secrets
- Full payment data

---

# 47. DATABASE ARCHITECTURE

Design database tables/models for at least:

```text
users
roles
permissions
role_permissions
user_roles

sessions
refresh_tokens
email_verifications
password_resets

courses
course_translations
course_modules
lessons
lesson_content

categories
subcategories

enrollments
lesson_progress
course_progress

pages
page_translations
page_sections
section_translations

menus
menu_items

media

languages
translations

products
product_categories
orders
order_items

feature_flags

seo_metadata

legal_documents
legal_document_versions
user_legal_acceptances

settings

audit_logs
```

Do not blindly create all of these if Prisma modeling reveals that some should be combined.

However, preserve clear domain separation.

Define:

- Foreign keys
- Unique constraints
- Indexes
- Cascade/restrict behavior
- Soft delete strategy where appropriate

---

# 48. SOFT DELETE STRATEGY

Decide which entities require soft deletion.

Potential candidates:

- Users
- Courses
- Products
- Pages

Do not soft-delete everything blindly.

For some data, archive status may be better.

Document the decision.

---

# 49. USER DELETION

User deletion must be handled carefully.

Do not casually destroy educational progress or legal records without considering requirements.

Possible approach:

- Deactivate
- Anonymize when legally required
- Retain required audit/legal records safely

Design this responsibly.

---

# 50. SETTINGS SYSTEM

Create centralized application settings.

Possible settings:

```text
Site Name
Site Logo
Favicon
Default Language
Available Languages
Contact Email
Social Links
Footer Configuration
Maintenance Mode
Registration Enabled
Shop Enabled
Blog Enabled
```

Settings should be manageable through Admin Panel.

The frontend must not hardcode the site logo or global configuration unnecessarily.

Use caching appropriately.

---

# 51. LOGO MANAGEMENT

Admin must be able to:

- Upload site logo
- Change logo
- Change favicon
- Configure alternate logos if supported

When changed, the website should update appropriately without code changes.

---

# 52. DYNAMIC FOOTER

The footer should also be dynamic.

Admin should be able to manage:

- Footer groups
- Footer links
- Social links
- Copyright text
- Legal links

---

# 53. SEARCH

Create a search architecture.

Initially support:

- Course search
- Category search
- Blog/content search if enabled

Use:

- Debouncing
- Server-side searching
- Pagination

Do not load the entire database into the frontend and filter there.

Design search so it can later migrate to a dedicated search engine if necessary.

---

# 54. COURSE ENROLLMENT

Course enrollment must support future business models.

For example:

```text
Free Course
Paid Course
Invite-only Course
Private Course
```

Design the data model to support extensibility.

A user should only access protected course content if authorized.

Do not rely on hiding frontend links.

Backend must verify access.

---

# 55. FEATURE AVAILABILITY

Create a reusable pattern for:

```text
Feature Disabled
Page Disabled
Course Disabled
Maintenance Mode
```

The system should gracefully handle unavailable content.

Do not return random broken UI.

---

# 56. MAINTENANCE MODE

Allow administrators to enable maintenance mode.

Requirements:

- Public users see maintenance page
- Authorized administrators can still access admin
- Health checks may still work
- SEO behavior should be considered carefully

---

# 57. ENVIRONMENT VARIABLES

Create:

```text
.env.example
```

Document every required variable.

Never hardcode:

- Database URLs
- API keys
- OAuth secrets
- JWT/session secrets
- Storage credentials

Use environment validation on startup.

The application should fail clearly if required production secrets are missing.

---

# 58. CODE QUALITY

The codebase must be:

- Readable
- Maintainable
- Modular
- Consistent
- Typed
- Documented

Use meaningful names.

Avoid:

```text
data
data2
temp
newData
handleStuff
doThing
```

Prefer meaningful domain names.

Comments should explain:

- Why something exists
- Important security decisions
- Complex algorithms
- Non-obvious business logic

Do not write comments that simply repeat the code.

Bad:

```ts
// Set user name
user.name = name;
```

Useful:

```ts
// Refresh tokens are rotated on every refresh to reduce the impact
// of token theft and allow reuse detection.
```

---

# 59. TYPESCRIPT

Use strict TypeScript.

Avoid:

```ts
any
```

unless absolutely unavoidable.

Define:

- DTOs
- API response types
- Domain types
- Shared types where appropriate

Do not create unnecessary duplicated types.

---

# 60. TESTING

Add a realistic testing strategy.

Include:

- Unit tests for critical business logic
- Integration tests for API flows
- Authentication tests
- Authorization tests
- Validation tests
- Critical end-to-end flows where practical

Critical flows include:

```text
Register
Verify account
Login
OAuth callback
Forgot password
Reset password
Course enrollment
Lesson progress
Admin authorization
Role change
Feature flag enforcement
```

---

# 61. DOCUMENTATION

Create proper documentation.

Required files:

```text
README.md
docs/architecture.md
docs/database.md
docs/security.md
docs/api.md
docs/development.md
```

README must include:

- Project overview
- Architecture
- Requirements
- Installation
- Environment setup
- Database setup
- Development commands
- Build commands
- Deployment notes

---

# 62. IMPLEMENTATION ORDER

Do not attempt to randomly build everything simultaneously.

Use the following phases.

## PHASE 1 — Architecture

Create:

- Project structure
- Architecture documentation
- Database plan
- API plan
- Auth plan
- Authorization plan

## PHASE 2 — Foundation

Set up:

- Monorepo
- Next.js
- Express
- TypeScript
- Prisma
- PostgreSQL
- Environment validation
- Shared configuration

## PHASE 3 — Authentication

Implement:

- Register
- Login
- Logout
- Email verification
- Password reset
- OAuth architecture
- Session/token security

## PHASE 4 — Authorization

Implement:

- Roles
- Permissions
- Middleware
- Policy checks

## PHASE 5 — Core Learning Domain

Implement:

- Categories
- Courses
- Modules
- Lessons
- Enrollment
- Progress tracking

## PHASE 6 — Public Website

Implement:

- Navigation
- Homepage
- Course catalog
- Course pages
- Learning interface
- User dashboard

## PHASE 7 — Admin Panel

Implement:

- Admin layout
- Dashboard
- User management
- Role management
- Course management
- Content management

## PHASE 8 — Dynamic CMS

Implement:

- Pages
- Sections
- Section registry
- Dynamic menus
- Dynamic footer

## PHASE 9 — Media and PDF

Implement:

- Media library
- Upload architecture
- PDF import workflow
- Rich content editing

## PHASE 10 — i18n

Implement:

- Languages
- UI translations
- Dynamic content translations
- Language switcher

## PHASE 11 — SEO

Implement:

- Metadata
- Sitemap
- Robots
- Structured data where appropriate

## PHASE 12 — E-Commerce

Implement as feature module:

- Products
- Categories
- Orders
- Cart
- Checkout architecture

## PHASE 13 — Security Review

Review:

- Authentication
- Authorization
- Input validation
- File uploads
- API exposure
- Rate limits
- Security headers
- Sensitive data exposure

## PHASE 14 — Performance Review

Review:

- Bundle size
- Database queries
- Caching
- Image optimization
- Pagination
- Rendering strategy

## PHASE 15 — Final Review

Perform a complete audit.

---

# 63. IMPORTANT RULES FOR CLAUDE

When implementing this project:

DO NOT:

- Hardcode content unnecessarily.
- Hardcode navigation.
- Hardcode categories.
- Hardcode site settings.
- Put sensitive data in frontend.
- Trust frontend authorization.
- Trust user IDs sent by the client.
- Put business logic inside React components.
- Put all backend logic inside controllers.
- Use `any` everywhere.
- Create huge 2,000-line components.
- Create huge god-service files.
- Build fake security through encryption/obfuscation of public API requests.
- Return stack traces in production.
- Store passwords in plain text.
- Store secrets in Git.
- Assume client-side validation is enough.
- Build fake CRUD that only works visually.

Every major feature must work end-to-end.

---

# 64. QUALITY STANDARD

For every feature ask:

### Architecture

- Is it scalable?
- Is it modular?
- Is it easy to change later?

### Security

- Is the server validating this?
- Is authorization enforced?
- Can a user manipulate an ID and access another user's data?
- Are secrets protected?

### Performance

- Is unnecessary data being loaded?
- Does this need pagination?
- Does this query need an index?

### UX

- Does it have loading state?
- Does it have error state?
- Does it have empty state?
- Does it work on mobile?

### Maintainability

- Can another developer understand this?
- Are names meaningful?
- Is the module structure logical?

---

# 65. FINAL PRODUCT REQUIREMENT

The final result must feel like a real modern startup/product, not a tutorial project.

It should feel like a production-quality:

# Web Academy / Online IT Learning Platform

with:

- Premium Public Website
- Student Dashboard
- Full Course Learning System
- Dynamic Courses
- Categories and Subcategories
- Rich Lesson Content
- PDF Import
- Video Support
- Progress Tracking
- Statistics
- Authentication
- OAuth
- OTP/Verification flows
- User Management
- Role Management
- Permission System
- Dynamic Admin Panel
- Dynamic CMS
- Dynamic Pages
- Dynamic Sections
- Dynamic Menus
- Dynamic Footer
- Media Library
- Multi-language System
- Armenian support
- English support
- Russian support
- German support
- Spanish support
- Italian support
- French support
- British English locale
- SEO
- Sitemap
- Legal pages
- Feature flags
- Optional E-Commerce
- Secure API
- Strong authorization
- Performance optimization
- Responsive design
- Clean architecture
- Clean code
- Full documentation

---

# 66. WORKING METHOD

Start from zero.

First inspect the current repository.

If the repository is empty:

1. Initialize the project architecture.
2. Create the monorepo.
3. Create frontend and backend applications.
4. Configure TypeScript.
5. Configure PostgreSQL and Prisma.
6. Create environment templates.
7. Create architecture documentation.

If there is existing code:

1. Inspect it first.
2. Do not blindly delete everything.
3. Identify reusable code.
4. Identify architectural problems.
5. Refactor carefully.

Before implementing each major module:

- Check existing architecture.
- Reuse established patterns.
- Avoid duplicate utilities.
- Avoid duplicate types.
- Avoid duplicate API logic.

After implementing each major module:

1. Check TypeScript errors.
2. Check lint errors.
3. Check build errors.
4. Check imports.
5. Check broken routes.
6. Check authorization.
7. Check edge cases.
8. Check responsive behavior.

---

# 67. FIRST RESPONSE EXPECTATION

Before generating the full implementation, begin by producing and executing a clear implementation plan.

First provide:

1. Proposed architecture.
2. Exact folder structure.
3. Database schema design.
4. Main entities and relationships.
5. Authentication strategy.
6. Authorization strategy.
7. Dynamic CMS strategy.
8. i18n strategy.
9. Security strategy.
10. Step-by-step implementation roadmap.

Then begin implementation from the foundation.

Do not skip architecture.

Do not jump directly into random UI components.

---

# FINAL INSTRUCTION

Treat this project as if it will become a real production product with real users and real data.

Build it from absolute zero with:

- Excellent architecture
- Clean code
- Strong security practices
- High performance
- Dynamic content management
- Professional UX/UI
- Responsive design
- Scalable database design
- Maintainable modules

Whenever there is an architectural choice, prefer the solution that is:

1. Secure
2. Maintainable
3. Scalable
4. Understandable
5. Performant

Do not sacrifice correctness for speed.

However, avoid unnecessary enterprise-level complexity when a simpler production-quality solution is sufficient.

Build every feature logically and connect frontend, backend, database, authentication, authorization, admin panel, and dynamic content properly.

The result should be a coherent, working, production-ready platform rather than a collection of disconnected UI pages.