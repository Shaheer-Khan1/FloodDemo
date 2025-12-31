import { useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useLocation } from "wouter";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Droplets, LayoutDashboard, Users, Shield, User, LogOut, Package, Plus, ChevronLeft, ChevronRight, Settings, Map } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, userProfile } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const navRef = useRef<HTMLDivElement | null>(null);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      toast({
        title: "Signed out",
        description: "You've been signed out successfully.",
      });
      setLocation("/login");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Sign out failed",
        description: error.message,
      });
    }
  };

  const menuItems = [
    // Dashboard - for non-installer, non-manager roles
    ...(userProfile && userProfile.role !== "installer" && userProfile.role !== "manager"
      ? [
          { title: "Dashboard", icon: LayoutDashboard, url: "/dashboard" },
        ].flat()
      : []),
    // Admin menu items - grouped
    ...(userProfile?.isAdmin ? [
      { title: "Administration", icon: Shield, url: "/admin-management" },
      { title: "Box Management", icon: Package, url: "/box-management" },
      { title: "Device Management", icon: Package, url: "/device-management" },
      { title: "Installation Management", icon: Settings, url: "/installation-management" },
    ] : []),
    // Installer-specific menu items
    ...(userProfile?.role === "installer" && !userProfile?.isAdmin ? [
      { title: "Installation Management", icon: Settings, url: "/installation-management" },
    ] : []),
    // Verifier-specific menu items
    ...(userProfile?.role === "verifier" && !userProfile?.isAdmin ? [
      { title: "Box Management", icon: Package, url: "/box-management" },
      { title: "Installation Management", icon: Settings, url: "/installation-management" },
    ] : []),
    // Manager-specific menu items (limited)
    ...(userProfile?.role === "manager" && !userProfile?.isAdmin
      ? [
          { title: "Teams", icon: Users, url: "/teams" },
          { title: "Box Management", icon: Package, url: "/box-management" },
          { title: "Installation Management", icon: Settings, url: "/installation-management" },
        ]
      : []),
    // Ministry-specific menu items
    ...(userProfile?.role === "ministry" && !userProfile?.isAdmin ? [
      { title: "All Devices", icon: Package, url: "/ministry-devices" },
      { title: "Installation Stats", icon: LayoutDashboard, url: "/ministry-stats" },
      { title: "Installations Map", icon: Map, url: "/installations-map" },
    ] : []),
  ];

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950">
      {/* Modern Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl shadow-sm">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-8">
            <button 
              onClick={() => {
                // Redirect based on user role
                if (userProfile?.role === "installer") {
                  setLocation("/new-installation");
                } else {
                  setLocation("/dashboard");
                }
              }}
              className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            >
              <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 flex items-center justify-center shadow-md">
                <Droplets className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-none">FlowSet</span>
                <span className="text-xs text-muted-foreground leading-none">IoT Installation</span>
              </div>
            </button>

            {/* Navigation Links with horizontal scroll arrows */}
            <div className="hidden md:flex items-center gap-1 max-w-[640px]">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  navRef.current?.scrollBy({ left: -200, behavior: "smooth" })
                }
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <nav
                ref={navRef}
                className="flex items-center gap-1 overflow-x-auto scrollbar-none"
              >
                {menuItems.map((item) => (
                  <Button
                    key={item.url}
                    variant="ghost"
                    onClick={() => setLocation(item.url)}
                    className={cn(
                      "gap-2 font-medium transition-all whitespace-nowrap",
                      location === item.url
                        ? "bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                    )}
                    data-testid={`nav-${item.url.slice(1)}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </Button>
                ))}
              </nav>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() =>
                  navRef.current?.scrollBy({ left: 200, behavior: "smooth" })
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Right Side: User Menu */}
          <div className="flex items-center gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  className="relative h-10 w-10 rounded-full ring-2 ring-slate-200 dark:ring-slate-800 hover:ring-blue-500 transition-all" 
                  data-testid="button-user-menu"
                >
                  {userProfile?.isAdmin ? (
                    <Avatar className="h-10 w-10 ring-2 ring-amber-500">
                      <AvatarImage src={userProfile?.photoURL} />
                      <AvatarFallback className="bg-gradient-to-br from-amber-500 to-amber-600 text-white font-semibold">
                        {userProfile?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={userProfile?.photoURL} />
                      <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-700 text-white font-semibold">
                        {userProfile?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                  )}
                  {userProfile?.isAdmin && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-amber-500 rounded-full border-2 border-white dark:border-slate-950 flex items-center justify-center">
                      <Shield className="h-2.5 w-2.5 text-white" />
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>
                  <div className="flex items-center gap-3">
                    {userProfile?.isAdmin ? (
                      <div className="relative">
                        <Avatar className="h-12 w-12 ring-2 ring-amber-500">
                          <AvatarImage src={userProfile?.photoURL} />
                          <AvatarFallback className="bg-gradient-to-br from-amber-500 to-amber-600 text-white">
                            {userProfile?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 bg-amber-500 rounded-full border-2 border-white dark:border-slate-900 flex items-center justify-center">
                          <Shield className="h-2.5 w-2.5 text-white" />
                        </span>
                      </div>
                    ) : (
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={userProfile?.photoURL} />
                        <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-700 text-white">
                          {userProfile?.displayName?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-semibold">{userProfile?.displayName}</p>
                      <p className="text-xs text-muted-foreground">{user?.email}</p>
                      {userProfile?.isAdmin && (
                        <Badge variant="secondary" className="w-fit text-[10px] h-5">Admin</Badge>
                      )}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Mobile Navigation */}
                <div className="md:hidden">
                  {menuItems.map((item) => (
                    <DropdownMenuItem 
                      key={item.url}
                      onClick={() => setLocation(item.url)}
                      className={cn(location === item.url && "bg-blue-50 dark:bg-blue-950/50")}
                    >
                      <item.icon className="mr-2 h-4 w-4" />
                      {item.title}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </div>
                
                <DropdownMenuItem onClick={() => setLocation("/profile")} data-testid="menu-profile">
                  <User className="mr-2 h-4 w-4" />
                  Profile
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleSignOut} 
                  data-testid="menu-signout"
                  className="text-red-600 dark:text-red-400 focus:text-red-600 dark:focus:text-red-400"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Main Content - flex-1 makes it grow to fill space */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-7xl">
        <div className="animate-in fade-in duration-500">
          {children}
        </div>
      </main>

      {/* Footer - stays at bottom */}
      <footer className="border-t bg-white/50 dark:bg-slate-950/50 backdrop-blur-sm mt-auto">
        <div className="container mx-auto px-4 py-6 text-center text-sm text-muted-foreground">
          <p>Built by <span className="font-semibold text-foreground">Smarttive</span> - FlowSet IoT Installation Management</p>
        </div>
      </footer>
    </div>
  );
}
