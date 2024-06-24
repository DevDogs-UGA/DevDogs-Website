'use client'

import "./Footer.css"
import React from 'react';
import { Box, Container, Stack, Text, useColorModeValue } from '@chakra-ui/react'

const Footerr = () => {
    return (
        <div className="footer">
            <div>
                <p><b>Socials</b></p>
            </div>
            <p><b>&copy;2024 DevDogs at the University of Georgia</b></p>
        </div>
    )
}

//export default Footer;

export default function Footer() {
  return (
    <div className="new-footer">
    <Box
      bg={useColorModeValue('#31304b', '#31304b')}
      color={useColorModeValue('white', 'white')}>
      <Container
        as={Stack}
        maxW={'6x1'}
        py={4}
        direction={{ base: 'column', md: 'row' }}
        spacing={4}
        justify={{ base: 'center', md: 'space-between' }}
        align={{ base: 'center', md: 'center' }}>
        <Stack direction={'row'} spacing={6}>
          <Box as="a" href={'https://github.com/DevDogs-UGA'}>
            Github
          </Box>
          <Box as="a" href={'https://www.linkedin.com/company/devdogs-uga/'}>
            LinkedIn
          </Box>
          <Box as="a" href={'https://linktr.ee/devdogs'}>
            Linktree
          </Box>
        </Stack>

      </Container>
      <div className="bot-text">
            <Text><b>&copy;2024 DevDogs at the University of Georgia</b></Text>
      </div>
    </Box>
    </div>
  )
}