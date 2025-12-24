# 👨‍💻 FloodWatch Console - Developer Guide

**Last Updated:** December 24, 2025  
**Version:** 1.0.0

---

## 📚 Documentation Index

This project has comprehensive documentation. Start here:

1. **[CODEBASE_INDEX_AND_OPTIMIZATION.md](./CODEBASE_INDEX_AND_OPTIMIZATION.md)** (80+ pages)
   - Complete feature index
   - Architecture overview
   - Performance optimizations
   - Scalability recommendations

2. **[OPTIMIZATION_SUMMARY.md](./OPTIMIZATION_SUMMARY.md)**
   - Quick summary of optimizations
   - Implementation checklist
   - Usage examples
   - Performance metrics

3. **[QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md)**
   - Setup instructions
   - Environment configuration
   - First-time setup

4. **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)**
   - Firebase configuration
   - Security rules
   - Storage setup

5. **This File (DEVELOPER_GUIDE.md)**
   - Development workflows
   - Coding standards
   - Common tasks

---

## 🚀 Quick Start

### **Prerequisites**
- Node.js 18+ (LTS recommended)
- npm or yarn
- Firebase account
- Git

### **Installation**
```bash
# Clone repository
git clone <your-repo-url>
cd FloodWatchConsole

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Firebase credentials

# Start development server
npm run dev
```

### **Development Server**
```bash
npm run dev          # Start Vite dev server (http://localhost:5173)
npm run build        # Build for production
npm run preview      # Preview production build
npm run check        # Type-check without emitting
```

---

## 🏗️ Project Structure

```
FloodWatchConsole/
├── src/
│   ├── components/          # Reusable React components
│   │   ├── ui/             # shadcn/ui components
│   │   ├── app-layout.tsx  # Main layout shell
│   │   ├── error-boundary.tsx  # Error handling
│   │   └── protected-route.tsx # Auth guards
│   │
│   ├── pages/              # Route pages (21 pages)
│   │   ├── login.tsx
│   │   ├── dashboard.tsx
│   │   ├── verification.tsx    # Largest: 3,880 lines
│   │   ├── admin.tsx           # 2nd largest: 2,658 lines
│   │   └── ...
│   │
│   ├── lib/                # Core utilities
│   │   ├── auth-context.tsx    # Auth provider
│   │   ├── firebase.ts         # Firebase config
│   │   ├── types.ts            # TypeScript types
│   │   ├── performance.ts      # Performance utils (NEW)
│   │   └── amanah-translations.ts
│   │
│   ├── hooks/              # Custom React hooks
│   │   ├── use-toast.ts
│   │   ├── use-mobile.tsx
│   │   └── use-debounce.ts     # Debounce hook (NEW)
│   │
│   ├── App.tsx             # Root component
│   ├── main.tsx            # Entry point
│   └── index.css           # Global styles
│
├── public/                 # Static assets
├── dist/                   # Build output
└── docs/                   # Documentation (generated)
```

---

## 🎨 Coding Standards

### **TypeScript**
```typescript
// ✅ DO: Use explicit types
interface UserData {
  id: string;
  name: string;
  email: string;
}

// ✅ DO: Use type inference for simple cases
const count = 5; // inferred as number

// ❌ DON'T: Use 'any'
const data: any = {}; // Avoid this

// ✅ DO: Use 'unknown' when type is truly unknown
const data: unknown = JSON.parse(response);
```

### **React Components**
```typescript
// ✅ DO: Functional components with TypeScript
interface Props {
  title: string;
  onSave: () => void;
}

export function MyComponent({ title, onSave }: Props) {
  return <div>{title}</div>;
}

// ✅ DO: Use named exports
export function MyComponent() {}

// ❌ DON'T: Use default exports (except for pages)
export default function MyComponent() {}
```

### **Performance Best Practices**
```typescript
// ✅ DO: Use useMemo for expensive calculations
const filteredData = useMemo(() => {
  return data.filter(item => item.active);
}, [data]);

// ✅ DO: Use useCallback for event handlers
const handleClick = useCallback(() => {
  doSomething();
}, [dependencies]);

// ✅ DO: Use React.lazy for code splitting
const HeavyComponent = lazy(() => import('./HeavyComponent'));
```

### **Firebase Best Practices**
```typescript
// ✅ DO: Use real-time listeners efficiently
useEffect(() => {
  const unsubscribe = onSnapshot(
    query(collection(db, "items"), where("active", "==", true)),
    (snapshot) => {
      setItems(snapshot.docs.map(doc => doc.data()));
    }
  );
  return () => unsubscribe(); // Always cleanup
}, []);

// ✅ DO: Batch writes when possible
const batch = writeBatch(db);
items.forEach(item => {
  batch.update(doc(db, "items", item.id), { processed: true });
});
await batch.commit();
```

---

## 🔧 Common Development Tasks

### **Adding a New Page**

1. **Create page file:**
```bash
src/pages/my-new-page.tsx
```

2. **Create page component:**
```typescript
import { Card } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";

export default function MyNewPage() {
  const { userProfile } = useAuth();
  
  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold">My New Page</h1>
      {/* Your content */}
    </div>
  );
}
```

3. **Add route in App.tsx:**
```typescript
import MyNewPage from "@/pages/my-new-page";

// In Router component:
<Route path="/my-new-page">
  <ProtectedRoute>
    <AppLayout>
      <MyNewPage />
    </AppLayout>
  </ProtectedRoute>
</Route>
```

4. **Add navigation link in app-layout.tsx:**
```typescript
{ title: "My New Page", icon: Star, url: "/my-new-page" }
```

### **Adding a New Component**

1. **Create component file:**
```bash
src/components/my-component.tsx
```

2. **Write component:**
```typescript
interface MyComponentProps {
  title: string;
  onAction: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  return (
    <div>
      <h2>{title}</h2>
      <button onClick={onAction}>Action</button>
    </div>
  );
}
```

3. **Use component:**
```typescript
import { MyComponent } from "@/components/my-component";

<MyComponent title="Hello" onAction={() => console.log('clicked')} />
```

### **Adding a New Firestore Collection**

1. **Update types.ts:**
```typescript
export interface MyData {
  id: string;
  name: string;
  createdAt?: Date;
}
```

2. **Update Firestore rules:**
```javascript
match /myCollection/{documentId} {
  allow read: if request.auth != null;
  allow write: if request.auth != null && isAdmin();
}
```

3. **Create data access hooks:**
```typescript
// In your component
const [myData, setMyData] = useState<MyData[]>([]);

useEffect(() => {
  const unsubscribe = onSnapshot(
    collection(db, "myCollection"),
    (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as MyData[];
      setMyData(data);
    }
  );
  return () => unsubscribe();
}, []);
```

### **Adding a shadcn/ui Component**

```bash
# Use the CLI to add components
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
npx shadcn-ui@latest add dialog
```

---

## 🐛 Debugging

### **Common Issues & Solutions**

#### **1. "Module not found" error**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### **2. Firebase permissions error**
- Check Firestore rules in Firebase Console
- Ensure user is authenticated
- Verify user role/permissions

#### **3. Build errors**
```bash
# Type-check first
npm run check

# Clean build
rm -rf dist
npm run build
```

#### **4. Hot reload not working**
```bash
# Restart dev server
npm run dev
```

### **Debugging Tools**

1. **React DevTools**
   - Components tree
   - Props inspection
   - Performance profiler

2. **Chrome DevTools**
   - Network tab for API calls
   - Console for errors
   - Performance tab for bottlenecks
   - Application tab for local storage

3. **Firebase Emulator Suite**
```bash
firebase init emulators
firebase emulators:start
```

---

## 🧪 Testing

### **Manual Testing Checklist**

Before deploying:
- [ ] Test all user roles (admin, installer, verifier, manager, ministry)
- [ ] Test authentication flow (login, logout, session)
- [ ] Test CRUD operations for each feature
- [ ] Test on mobile devices (responsive design)
- [ ] Test with slow 3G connection (Chrome DevTools)
- [ ] Check console for errors
- [ ] Test error boundaries (intentionally trigger errors)
- [ ] Verify all real-time updates work
- [ ] Test file uploads (images, CSV)
- [ ] Test all filters and search functionality

### **Performance Testing**

1. **Lighthouse Audit:**
```bash
# In Chrome DevTools > Lighthouse
# Run audit on:
- Performance
- Accessibility
- Best Practices
- SEO
```

2. **Load Testing:**
- Test with 1000+ devices
- Test with 1000+ installations
- Test with multiple concurrent users

---

## 🚀 Deployment

### **Production Build**

```bash
# Build
npm run build

# Test production build locally
npm run preview

# Deploy to Firebase Hosting
firebase deploy --only hosting
```

### **Pre-Deployment Checklist**

- [ ] All tests passing
- [ ] No console errors
- [ ] Lighthouse score > 90
- [ ] Bundle size optimized
- [ ] Environment variables configured
- [ ] Firebase rules updated
- [ ] Database indexes created
- [ ] Backup database (if needed)

### **Environment Variables**

Create `.env` file:
```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_API_KEY=your_external_api_key
```

---

## 📝 Git Workflow

### **Branch Strategy**

```
main (production)
  ├── develop (staging)
  │   ├── feature/new-feature
  │   ├── fix/bug-fix
  │   └── refactor/optimization
```

### **Commit Message Format**

```
type(scope): subject

[optional body]

[optional footer]
```

**Types:**
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `perf`: Performance improvement
- `test`: Adding tests
- `chore`: Maintenance

**Examples:**
```bash
git commit -m "feat(verification): add Amanah filter"
git commit -m "fix(login): resolve session timeout issue"
git commit -m "perf(verification): optimize device lookups"
git commit -m "docs: update developer guide"
```

---

## 🔐 Security Best Practices

1. **Never commit secrets:**
   - Add `.env` to `.gitignore`
   - Use environment variables
   - Use Firebase Environment Config

2. **Validate all user input:**
```typescript
import { z } from 'zod';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const validated = schema.parse(userInput);
```

3. **Sanitize user content:**
```typescript
import DOMPurify from 'dompurify';

const clean = DOMPurify.sanitize(userInput);
```

4. **Use Firestore security rules:**
```javascript
// Allow only authenticated users
allow read, write: if request.auth != null;

// Role-based access
allow write: if request.auth.token.admin == true;
```

---

## 📊 Monitoring & Analytics

### **Firebase Performance Monitoring**
```typescript
// Already configured in firebase.ts
// Monitor in Firebase Console
```

### **Error Tracking**
```typescript
// ErrorBoundary automatically catches errors
// Add Sentry for production error tracking
```

### **Custom Analytics**
```typescript
import { logEvent } from 'firebase/analytics';

// Track custom events
logEvent(analytics, 'button_click', {
  button_name: 'submit_installation'
});
```

---

## 🆘 Getting Help

### **Resources**

- **Documentation:** See all `.md` files in root directory
- **Firebase Docs:** https://firebase.google.com/docs
- **React Docs:** https://react.dev
- **TypeScript Docs:** https://www.typescriptlang.org/docs
- **Tailwind CSS:** https://tailwindcss.com/docs
- **shadcn/ui:** https://ui.shadcn.com

### **Common Questions**

**Q: How do I add a new user role?**
A: Update `types.ts`, modify Firestore rules, update `protected-route.tsx`, and add role-specific logic in pages.

**Q: How do I optimize a slow page?**
A: Use the performance utilities in `src/lib/performance.ts`, check with React DevTools Profiler, implement virtual scrolling if needed.

**Q: How do I add Arabic translations?**
A: Update `src/lib/amanah-translations.ts` with new mappings.

**Q: How do I handle file uploads?**
A: See `new-installation.tsx` for examples of Firebase Storage integration.

---

## 🎯 Next Steps

1. Read [CODEBASE_INDEX_AND_OPTIMIZATION.md](./CODEBASE_INDEX_AND_OPTIMIZATION.md)
2. Review [OPTIMIZATION_SUMMARY.md](./OPTIMIZATION_SUMMARY.md)
3. Set up your development environment
4. Implement priority optimizations
5. Add tests for critical features
6. Set up CI/CD pipeline
7. Configure monitoring and alerts

---

## ✨ Happy Coding!

Remember:
- Write clean, maintainable code
- Optimize for performance
- Test thoroughly
- Document your changes
- Ask for help when needed

**Questions?** Check the documentation or consult with the team.

---

**Last Updated:** December 24, 2025  
**Maintained by:** Development Team

