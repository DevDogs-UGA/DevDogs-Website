CREATE OR REPLACE FUNCTION platform.handle_slug (
  input text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select regexp_replace(
    lower(
      replace(replace(replace(replace(replace(
        translate(
          input,
          'ÀÁÂÃÄÅĀĂĄÇĆČĎĐÈÉÊËĒĖĘĚÌÍÎÏĪĮŁÑŃŇÒÓÔÕÖØŌŐŘŚŠŞȘŤŢȚÙÚÛÜŪŮŰŲÝŸŹŻŽàáâãäåāăąçćčďđèéêëēėęěìíîïīįłñńňòóôõöøōőřśšşșťţțùúûüūůűųýÿźżž',
          'AAAAAAAAACCCDDEEEEEEEEIIIIIILNNNOOOOOOOORSSSSTTTUUUUUUUUYYZZZaaaaaaaaacccddeeeeeeeeiiiiiilnnnoooooooorsssstttuuuuuuuuyyzzz'
        ),
        'ß', 'ss'), 'æ', 'ae'), 'Æ', 'AE'), 'œ', 'oe'), 'Œ', 'OE')
    ),
    '[^a-z0-9]', '', 'g'
  );
$function$;

GRANT EXECUTE ON FUNCTION "platform"."handle_slug"(text) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "platform"."handle_slug"(text) FROM PUBLIC;
