import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ShoppingBag, User, LogOut, ChefHat } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useCart } from "@/lib/cart-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function StorefrontHeader() {
  const { user, isMerchant, signOut } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const { location } = useRouterState();

  return (
    <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-spice shadow-glow">
            <ChefHat className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">
            Quick<span className="text-gradient-spice">Serve</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          <Link
            to="/"
            className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-full px-4 py-2 text-sm font-medium text-foreground bg-muted" }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>
          <Link
            to="/explore"
            className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-full px-4 py-2 text-sm font-medium text-foreground bg-muted" }}
          >
            Explore
          </Link>
          <Link
            to="/orders"
            className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            activeProps={{ className: "rounded-full px-4 py-2 text-sm font-medium text-foreground bg-muted" }}
          >
            My Orders
          </Link>
          {isMerchant && (
            <Link
              to="/merchant"
              className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Merchant
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="relative rounded-full"
            onClick={() => navigate({ to: "/checkout" })}
          >
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-gradient-spice px-1 text-[10px] font-bold text-primary-foreground">
                {itemCount}
              </span>
            )}
          </Button>

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="rounded-full">
                  <User className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate({ to: "/orders" })}>
                  My orders
                </DropdownMenuItem>
                {isMerchant ? (
                  <DropdownMenuItem onClick={() => navigate({ to: "/merchant" })}>
                    Merchant dashboard
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onClick={() => navigate({ to: "/become-merchant" })}>
                    Become a merchant
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={async () => {
                    await signOut();
                    navigate({ to: "/" });
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button
              size="sm"
              className="rounded-full bg-gradient-spice text-primary-foreground shadow-glow hover:opacity-90"
              onClick={() => navigate({ to: "/auth", search: { redirect: location.pathname } })}
            >
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
