<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Los tests de PHP no dependen de haber compilado el frontend (npm run build).
        $this->withoutVite();
    }
}
