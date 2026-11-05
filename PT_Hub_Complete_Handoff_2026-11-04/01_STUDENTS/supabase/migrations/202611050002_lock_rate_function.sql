revoke execute on function public.pt_hub_allow_request(text, integer)
from anon, authenticated, public;

grant execute on function public.pt_hub_allow_request(text, integer)
to service_role;
